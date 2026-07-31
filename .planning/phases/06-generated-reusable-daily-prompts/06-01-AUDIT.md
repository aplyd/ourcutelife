# Phase 6 Audit — Generated and Reusable Daily Prompts

**Audited:** 2026-07-24
**Scope:** Current prompt schema, selection path, response/reveal boundary, AI/cloud-function readiness, and the smallest safe next slice.

## Product constraints carried forward

- Daily prompt answers remain separate from Moments.
- Partner answers stay hidden until both partners submit.
- Reuse and ranking must never expose another couple's answers, identities, tags, or completion history.
- Prompt guidance may be inspired by evidence-based Gottman principles, but must not copy proprietary material, imply affiliation, diagnose, or make therapy claims.
- Phase 5's persisted couple-day lifecycle remains authoritative for prompt date, timezone, and notification scheduling.

## Current path

1. `prompts.today` authenticates the viewer, resolves the couple and authoritative prompt date, reads up to ten of the viewer's recent Moments, and derives unique tags.
2. `chooseGeneratedContent` deterministically selects from six in-code prompt templates, four games, and four quizzes using a date/tag hash. Despite its name, it does not call a model or persist generated content.
3. The actual daily question returned to the client is separately recomputed by `getDailyPromptQuestions(promptDate)` without tags.
4. `prompts.answer` re-resolves the lifecycle, derives that same date-only question server-side, and stores the question text alongside each partner response. Client-authored prompt text is accepted only for rollout compatibility and ignored.
5. `prompts.today` loads both response rows and reveals the partner response only when both rows exist.
6. Phase 5 dispatch derives generic notification copy server-side and does not include prompt or answer content.

## Existing data model

- `promptResponses` is one response row per user/date by convention, containing `coupleId`, `userId`, `promptDate`, duplicated prompt text, response text, and `createdAt`.
- `dailyPromptLifecycles` is one couple/date row by convention and already owns the canonical prompt date and timezone snapshot, but it has no prompt assignment/reference.
- There is no reusable prompt library, prompt-generation attempt table, per-couple prompt history, completion/ranking record, safety status, model provenance, or generation fallback record.
- The current indexes support response lookup by user/date and couple/date, but schema indexes do not enforce uniqueness. Mutations fail closed when duplicates are observed.

## AI/cloud-function readiness

- Vercel AI SDK packages (`ai` and `@ai-sdk/openai`) are already installed.
- The invoked Chat coach already imports the AI SDK, uses an internal action, and reads the shared `OPENAI_API_KEY` / optional `OPENAI_MODEL` declarations from `convex/convex.config.ts`. Daily prompts do not currently invoke that action or any model, and there is no prompt-generation cloud function today.
- No daily-prompt-specific model policy, generation prompt version, provenance, or configuration exists yet. A later slice must explicitly decide whether to reuse the shared OpenAI declarations or add feature-specific declarations; under the generated Convex guidance, any declarations belong in `convex/convex.config.ts` via `defineApp({ env: ... })`, not direct `process.env` reads.
- A future model call should live in a dedicated internal action. The action cannot use `ctx.db`; it should receive bounded, privacy-safe inputs and call a small internal mutation to persist a validated result. Queries/mutations must remain outside a `"use node"` action file.
- Daily-prompt model/provider wiring, credential or billing changes, and deployment remain explicit approval gates. Deterministic mocked action tests and a no-credential fallback path can be completed locally first.

## Gaps and risks

1. **No canonical persisted prompt assignment.** The question is recomputed from code, so changing the in-code bank can change the question for an existing lifecycle before or between partner submissions.
2. **Split selection can disagree.** `prompts.today` selects principle/game/quiz with personal tags but selects the displayed question without tags. The returned principle can therefore describe a different bank entry than the actual question.
3. **Prompt text is duplicated in response rows.** This preserves historical copy but cannot represent one reusable prompt with many couple completions or maintain ranking safely.
4. **No exact completion boundary.** Both responses imply completion, but there is no idempotent one-per-couple/day record that can increment a reusable prompt's completion rank exactly once.
5. **No reusable inventory policy.** There is no deduplication, recency/diversity balancing, safety review state, per-couple exclusion history, or new-couple seed behavior.
6. **Moment tags are not an appropriate global reuse input.** They are private couple/user context. They must not be stored on a reusable prompt, sent to a shared generation request in identifiable form, or affect cross-couple ranking. The safest first implementation should not use answers or Moment text/tags for generation.
7. **The current library is too small for durable variety.** Six deterministic prompts will repeat frequently and have no versioning or provenance.

## Safe target shape

Keep lifecycle assignment, reusable content, and private completion separate:

- `dailyPrompts`: reusable prompt text plus normalized fingerprint, principle/category, source (`seed` or `ai`), safety status, model/prompt-version provenance where applicable, aggregate completion count, and timestamps.
- `dailyPromptAssignments` or an additive `promptId` on `dailyPromptLifecycles`: one immutable canonical prompt per couple/date. Prefer the lifecycle reference if assignment creation remains in the lifecycle transaction; keep fields optional during additive rollout.
- `dailyPromptCompletions`: one private row per couple/date/prompt recording only that the couple completed it and when. Do not store answers, user IDs, Moment tags, or identities in the reusable prompt/ranking record.
- Keep `promptResponses` as the private answer store. During rollout, retain its `prompt` text for compatibility/history, but derive it from the persisted assignment rather than recomputing from mutable code.

The completion mutation should transactionally create-or-return the couple/date completion and increment the prompt's aggregate count only on first creation. Selection should use indexed, bounded candidates and combine completion rank with recency, diversity, fingerprint deduplication, safety status, and the couple's bounded assignment history.

## Smallest safe next slice

Draft and execute a schema/assignment foundation before any model call:

1. Add an additive reusable prompt table, immutable lifecycle prompt reference, and private completion table with indexes named from all indexed fields.
2. Seed the existing six questions as deterministic safe fallback inventory in tests/local fixtures; do not run a live migration.
3. Assign one canonical prompt exactly once when reconciling/creating a lifecycle, and make `today` plus `answer` read that assignment.
4. Preserve legacy lifecycle compatibility with a deterministic fallback assignment path so existing rows do not break.
5. Capture exact-once completion when the second answer is saved, with tests proving no cross-couple data leakage and no double rank increment on answer edits/retries.
6. Defer the AI action, provider configuration, safety-generation prompt, and live credentials to the following bounded slice after this persistence boundary is approved and verified.

## Verification contract for that slice

- Convex tests: immutable assignment, replay convergence, legacy lifecycle fallback, same question for both partners, same question after code-bank changes, exact-once completion/rank, edit/retry idempotency, bounded indexed selection, and cross-couple privacy.
- Existing Phase 5 prompt lifecycle, notification, and private reveal tests remain green.
- Run formatting, lint, typecheck, unit tests, Convex tests, `git diff --check`, and repository review.
- Use mock auth for an Argent Today → prompt sheet walkthrough if the returned prompt path changes; no real provider call, deployment, migration, or notification.
