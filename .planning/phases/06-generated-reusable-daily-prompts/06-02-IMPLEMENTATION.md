# Phase 6 Slice 06-02 — Persistence Foundation

Date: 2026-07-27

## Scope completed

All three RED/GREEN boundaries from `06-02-PLAN.md` are locally complete.

### RED/GREEN 1 — immutable assignment

- Added the reusable `dailyPrompts` inventory schema.
- Added optional immutable `dailyPromptLifecycles.promptId` for legacy compatibility.
- Added the future `dailyPromptCompletions` schema and indexes without runtime completion behavior.
- Added exactly six approved, privacy-safe fallback prompts.
- Lifecycle reconciliation transactionally converges seed inventory and freezes one approved prompt for new and legacy lifecycle rows.
- Selection is approved-only, indexed, bounded to 64 ranking candidates, deterministic, and excludes up to 12 recent couple assignments when an alternative exists.
- Existing assignments remain immutable.
- Missing, unsafe, malformed, duplicate-fingerprint, and ambiguous lifecycle state fails closed, including a selected fingerprint duplicated outside the 64-row ranking window.

### RED/GREEN 2 — canonical reads and writes

- `getTodayState` and `prompts.today` resolve prompt text and principle from the lifecycle's immutable reusable-prompt assignment.
- Before lifecycle creation, while notification readiness blocks planning, or while a legacy lifecycle still lacks `promptId`, read surfaces use the deterministic shared-library fallback so Today, Weekly Game, and Tiny Quiz remain available; answer writes still require an assignment.
- `prompts.answer` requires a valid assignment and stores compatibility prompt text from the referenced `dailyPrompts` row.
- Legacy client prompt text remains accepted during rollout but is non-authoritative.
- Forged client prompt text and Moment tags cannot alter the stored or displayed canonical prompt.
- `dailyPromptLibrary.ts` is the sole owner of the six fallback prompt texts and principles; Moment tags continue to affect Weekly Game and Tiny Quiz selection but not the daily question.
- Duplicate or mismatched response state fails closed.
- Partner answer content remains private until both partners submit.
- Weekly Game and Tiny Quiz behavior remains unchanged.

### RED/GREEN 3 — exact-once private completion

- The answer transaction validates the exact lifecycle recipient set and canonical assigned prompt across all couple-day response rows.
- The first partner answer creates no completion and no rank increment.
- The second distinct partner answer atomically creates one private couple-day completion and increments the reusable prompt count once.
- Retries and edits return the existing completion without incrementing again; malformed, premature, duplicate, or mismatched completion/response state fails closed.
- Completion rows contain only lifecycle, couple, prompt-date, prompt, and timestamps; they contain no answer text, user ID, Moment data, tag, or notification state.
- Legacy lifecycles with existing canonical responses freeze the exact approved prompt already copied into those responses; mixed, unknown, unsafe, malformed, duplicate, or ambiguous legacy response state fails closed without assigning a different question.
- Read-time compatibility validation prevents existing answers from being revealed under a mismatched immutable assignment.
- Concurrent/replayed second answers create one completion and one rank increment, while two couples completing the same shared prompt create two private rows and exactly two aggregate increments.

AI/model generation, provider configuration, and broader ranking policy remain deferred.

## Verification

Final coordinator verification on the cumulative three-boundary tree:

- Focused prompt/assignment tests: **63/63 passed**.
- Full unit suite: **84/84 passed**.
- Full Convex suite: **170/170 passed**.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with **0 warnings and 0 errors**.
- Targeted `oxfmt --check`: passed.
- `git diff --check`: passed.
- `tools/agent_validate`: passed.
- `tools/agent_review`: no obvious added-line security patterns.

The prior first-two-boundary independent review passed with no findings. The first completion-boundary review found one High legacy-rollout issue and one Medium test-coverage gap; both were TDD-corrected. The final independent no-edit cumulative re-review returned **PASS / APPROVE** with **0 Critical, 0 High, 0 Medium, and 0 Low findings**. It independently reran the focused 63/63 tests, expanded prompt/lifecycle 87/87 tests, full Convex 170/170 suite, unit 84/84 suite, typecheck, lint, formatting, validation, security review, and whitespace checks, and proved the worktree unchanged.

Expected mocked failure-path diagnostics and the existing timer-overflow warning appeared during Convex tests; no test failed and no live provider was contacted.

## Mock-auth Argent evidence

Argent v0.13.0 verified the installed mock-auth app on iPhone 17 Pro, iOS 26.5, device `F736E64F-ED8F-475C-BD05-7C156B568F74`.

- Restarted `com.ourcutelife.app` and opened `ourcutelife:///prompts/today`.
- Public accessibility inspection showed the assigned-looking question **“What small thing made you feel loved today?”**, the `Daily prompt answer` field, and the `Submit daily prompt answer` button.
- Visual inspection confirmed the sheet, question, blank input, and disabled Submit control were legible without clipping or overlap.
- The Hermes debugger connected to this repository with 9 loaded scripts, source maps ready, and 0 captured log entries.
- Low-level native inspection remained unavailable because Argent continued to return `restart_required`; no native-trait claim is made.
- No disposable draft was entered: the production input path records answer-start on the first nonblank input, so typing would violate this walkthrough's no-backend-mutation constraint.
- The mock-auth fixture cannot prove that its visible question came from a persisted live lifecycle assignment. The Convex tests provide the assignment-backed read/write proof.

Screenshot: `.planning/artifacts/2026-07-27-phase6-canonical-prompts/prompt-sheet.png`
SHA-256: `cc07867d02f724fa1e73ceb813efa28256bd4f1c2f5765f2ca1d9b4442456df0`

## External effects

No provider/model call, credential access, notification, live database operation, migration, deployment, install, stash, reset, push, or external communication occurred.

## Next bounded boundary after review

Plan the no-credential AI generation boundary, including provider fallback, safety validation, provenance, deduplication, and privacy-safe bounded inputs, without changing live configuration or invoking a model.
