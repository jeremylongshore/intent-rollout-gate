import type { RolloutPolicy } from "@intentsolutions/rollout-gate";

/** Producer contract emitted by j-rig for real-skill promotion rows. */
export const SKILL_PROMOTION_EVIDENCE_SCHEMA = "j-rig/skill-promotion/v1";

const SKILL_GATE_PREFIX = "j-rig:local:";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RecordValue = Record<string, unknown>;

function asRecord(value: unknown): RecordValue | null {
  return value !== null && typeof value === "object"
    ? (value as RecordValue)
    : null;
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256_PATTERN.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function matchesPattern(pattern: string, value: string): boolean {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(value);
}

function rowsFromBundle(bundle: unknown): unknown[] | null {
  if (Array.isArray(bundle)) return bundle;
  const record = asRecord(bundle);
  return record !== null && Array.isArray(record.rows) ? record.rows : null;
}

function failure(index: number, reason: string): string[] {
  return [`skill promotion row at index ${index}: ${reason}`];
}

function validateSkillPromotionRow(row: unknown, index: number): string[] {
  const statement = asRecord(row);
  const predicate = asRecord(statement?.predicate);
  if (predicate === null) {
    return failure(index, "missing predicate");
  }

  if (predicate.gate_decision !== "pass") {
    return failure(
      index,
      `predicate gate_decision must be pass (got ${String(predicate.gate_decision ?? "missing")})`,
    );
  }

  const subjects = statement?.subject;
  if (
    !Array.isArray(subjects) ||
    !subjects.some((subject) => {
      const subjectRecord = asRecord(subject);
      const digest = asRecord(subjectRecord?.digest);
      return (
        isSha256(predicate.input_hash) &&
        digest?.sha256 === predicate.input_hash.slice("sha256:".length)
      );
    })
  ) {
    return failure(index, "subject digest does not match predicate input_hash");
  }

  const metadata = asRecord(predicate.metadata);
  if (metadata === null) {
    return failure(index, "metadata is missing");
  }
  if (metadata.schema !== SKILL_PROMOTION_EVIDENCE_SCHEMA) {
    return failure(
      index,
      `metadata.schema must be ${SKILL_PROMOTION_EVIDENCE_SCHEMA}`,
    );
  }

  if (!isUuid(metadata.eval_run_id)) {
    return failure(index, "metadata.eval_run_id must be a UUID");
  }
  if (
    !Array.isArray(metadata.run_ids) ||
    !metadata.run_ids.every(isUuid) ||
    !metadata.run_ids.includes(metadata.eval_run_id)
  ) {
    return failure(index, "metadata.run_ids must contain eval_run_id");
  }
  if (!isPositiveInteger(metadata.storage_run_id)) {
    return failure(index, "metadata.storage_run_id must be a positive integer");
  }
  if (
    !Array.isArray(metadata.storage_run_ids) ||
    !metadata.storage_run_ids.every(isPositiveInteger) ||
    !metadata.storage_run_ids.includes(metadata.storage_run_id)
  ) {
    return failure(
      index,
      "metadata.storage_run_ids must contain storage_run_id",
    );
  }

  const skill = asRecord(metadata.skill);
  if (skill === null) return failure(index, "metadata.skill is missing");
  if (
    !isNonEmptyString(skill.name) ||
    !isNonEmptyString(skill.version) ||
    !isSha256(skill.snapshot_sha256)
  ) {
    return failure(
      index,
      "metadata.skill identity or snapshot hash is invalid",
    );
  }
  if (predicate.input_hash !== skill.snapshot_sha256) {
    return failure(
      index,
      "metadata.skill.snapshot_sha256 does not match input_hash",
    );
  }
  if (
    skill.skill_version_id !==
    `j-rig:skill-version:${skill.snapshot_sha256.slice("sha256:".length)}`
  ) {
    return failure(
      index,
      "metadata.skill.skill_version_id is not content-addressed",
    );
  }

  const evalSpec = asRecord(metadata.eval_spec);
  if (evalSpec === null) return failure(index, "metadata.eval_spec is missing");
  if (
    !isNonEmptyString(evalSpec.id) ||
    !isNonEmptyString(evalSpec.version) ||
    !isSha256(evalSpec.profile_sha256) ||
    evalSpec.identity_kind !== "j-rig-skill-profile"
  ) {
    return failure(
      index,
      "metadata.eval_spec identity or profile hash is invalid",
    );
  }
  if (predicate.policy_hash !== evalSpec.profile_sha256) {
    return failure(
      index,
      "metadata.eval_spec.profile_sha256 does not match policy_hash",
    );
  }

  const grader = asRecord(metadata.selected_grader);
  if (
    grader === null ||
    !isNonEmptyString(grader.grader_id) ||
    !isNonEmptyString(grader.grader_version) ||
    !isSha256(grader.grader_snapshot_sha256)
  ) {
    return failure(index, "metadata.selected_grader identity is invalid");
  }

  const thresholds = asRecord(metadata.thresholds);
  if (thresholds === null)
    return failure(index, "metadata.thresholds is missing");
  if (
    thresholds.status !== "pass" ||
    thresholds.required_pass_rate !== 1 ||
    thresholds.observed_pass_rate !== 1 ||
    !isPositiveInteger(thresholds.total_criteria) ||
    !isNonNegativeInteger(thresholds.passed) ||
    !isNonNegativeInteger(thresholds.failed) ||
    !isNonNegativeInteger(thresholds.unsure) ||
    !isNonNegativeInteger(thresholds.blocker_failures) ||
    !isNonNegativeInteger(thresholds.unstable_blocker_failures) ||
    (thresholds.min_blocker_agreement !== null &&
      (typeof thresholds.min_blocker_agreement !== "number" ||
        thresholds.min_blocker_agreement < 0.5 ||
        thresholds.min_blocker_agreement > 1))
  ) {
    return failure(index, "metadata.thresholds does not prove a clean pass");
  }
  if (
    thresholds.failed !== 0 ||
    thresholds.unsure !== 0 ||
    thresholds.blocker_failures !== 0
  ) {
    return failure(
      index,
      "metadata.thresholds contains failed or unsure criteria",
    );
  }

  const regression = asRecord(metadata.regression);
  if (regression === null)
    return failure(index, "metadata.regression is missing");
  if (
    regression.required !== true ||
    regression.enabled !== true ||
    !isSha256(regression.baseline_sha256) ||
    regression.result !== "no-regressions" ||
    regression.count !== 0 ||
    regression.sacred_count !== 0
  ) {
    return failure(
      index,
      "metadata.regression must prove an executed no-regression comparison",
    );
  }

  const baseline = asRecord(metadata.baseline);
  if (
    baseline === null ||
    typeof baseline.enabled !== "boolean" ||
    !["not-run", "adds-value", "obsolete-review", "no-comparison"].includes(
      String(baseline.result),
    ) ||
    !isNonNegativeInteger(baseline.comparison_count) ||
    !isNonNegativeInteger(baseline.value_addition_count)
  ) {
    return failure(index, "metadata.baseline compatibility outcome is invalid");
  }

  if (metadata.rollout_decision !== "ship") {
    return failure(index, "metadata.rollout_decision must be ship");
  }
  if (metadata.promotion_eligible !== true) {
    return failure(index, "metadata.promotion_eligible must be true");
  }
  if (metadata.gate_decision !== "pass") {
    return failure(index, "metadata.gate_decision must be pass");
  }
  if (
    !Array.isArray(metadata.promotion_reasons) ||
    metadata.promotion_reasons.length === 0 ||
    !metadata.promotion_reasons.every(isNonEmptyString)
  ) {
    return failure(index, "metadata.promotion_reasons must be non-empty");
  }

  return [];
}

/**
 * Validate the producer-side promotion contract for required real-skill rows.
 *
 * This is a provenance preflight, not a second rollout engine: it only runs
 * for `j-rig:local:*` rows matched by a required policy pattern and checks
 * that the producer's versioned identity/eligibility evidence is intact.
 * Generic report rows and optional unknown skill rows retain the delegated
 * package's existing compatibility behavior.
 */
export function validateSkillPromotionBinding(
  bundle: unknown,
  policy: RolloutPolicy,
): string[] {
  const rows = rowsFromBundle(bundle);
  if (rows === null) return [];

  const reasons: string[] = [];
  rows.forEach((row, index) => {
    const predicate = asRecord(asRecord(row)?.predicate);
    const gateId = predicate?.gate_id;
    if (
      typeof gateId !== "string" ||
      !gateId.startsWith(SKILL_GATE_PREFIX) ||
      !policy.required_gates.some((pattern) => matchesPattern(pattern, gateId))
    ) {
      return;
    }
    reasons.push(...validateSkillPromotionRow(row, index));
  });
  return reasons;
}
