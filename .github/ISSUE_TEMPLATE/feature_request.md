---
name: Feature request
about: Propose an enhancement to the Rollout Gate action
title: "[feat] "
labels: enhancement
assignees: jeremylongshore
---

## Problem

What gap or pain point motivates this request?

## Proposed change

What you would like the action to do.

## Scope note

This repo is intentionally a **thin shell** — decision logic lives in the
[`@intentsolutions/rollout-gate`](https://www.npmjs.com/package/@intentsolutions/rollout-gate)
package, and the consumed/emitted predicate shapes live in the kernel
[`@intentsolutions/core`](https://www.npmjs.com/package/@intentsolutions/core). If your
request changes decision semantics or the predicate body, it belongs upstream in one of
those packages rather than here. Shell-level requests (inputs, outputs, step summary,
fail-closed behavior, workflow ergonomics) are in scope here.

## Alternatives considered

Any other approaches you weighed.

## Additional context

Links, prior art, or related issues.
