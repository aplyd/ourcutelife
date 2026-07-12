# 03-01 Agentic engineering foundation

Updated: 2026-07-11T21:49:40-07:00

## Scope

Start the repo-local agentic engineering foundation phase so ourcutelife agents have the same operational primitives Austin described: router docs, workflow docs, validation/review commands, testing guidance, visual verification guidance, performance guidance, and feedback capture.

## Added in this slice

- `AGENT_WORKFLOW.md` — standard repo-local execution loop and definition of done.
- `docs/agent/CODING_CONVENTIONS.md` — standing code/review conventions with Convex/privacy emphasis.
- `docs/agent/TESTING.md` — validation entrypoint, Argent smoke slot, and test inventory seed.
- `docs/agent/REVIEW.md` — independent review expectations and personas.
- `docs/agent/VISUAL_VERIFICATION.md` — Argent/direct-xcode simulator evidence expectations.
- `docs/agent/PERFORMANCE.md` — measurement-first performance guidance.
- `docs/agent/FEEDBACK.md` — process-improvement log.
- `tools/agent_validate` — repo validation wrapper around format/lint/typecheck/diff checks.
- `tools/agent_review` — local review packet/security-grep helper.
- `tools/agent_commit_sweep` — recent-commit hygiene sweep for changed files, verification mentions, and risky added lines.
- `package.json` scripts: `agent:validate`, `agent:review`, `agent:sweep`.
- `docs/agent/TESTING.md` — behavioral test harness plan for pure unit tests, route/component smoke tests, Convex/server tests, and Argent device smoke evidence.

## Remaining foundation gaps

- No behavioral test harness yet.
- No scripted visual regression baseline yet.
- `tools/agent_review` is a local helper, not a full cross-model review dispatcher.
- No worksheet template/git-tag flow yet.
- No scheduled/cron enforcement for recent-commit sweeps yet.

## Verification plan

- Run `tools/agent_validate`.
- Run `tools/agent_review` against the current foundation diff.
- Commit as a docs/tooling foundation slice if checks pass.
