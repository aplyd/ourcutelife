# Testing and Verification

Summary:

1. This file defines how agents prove work in this repo.
2. `tools/agent_validate` is the default validation entrypoint.
3. Mobile/UI work should add Argent evidence when feasible.
4. Add targeted tests when a practical harness exists; otherwise record the missing harness as a gap.
5. Keep a test inventory here as automated tests are added.
6. False-confidence tests should be called out and fixed or rewritten.
7. Update this file when a new test command or smoke flow is established.

## Standard validation

```bash
tools/agent_validate
```

## Test inventory

| Area            | Command/file                 | What it proves               | Notes                               |
| --------------- | ---------------------------- | ---------------------------- | ----------------------------------- |
| Repo validation | `tools/agent_validate`       | Formatting/lint/type smoke   | Not a substitute for behavior tests |
| Mobile smoke    | Argent simulator walkthrough | Screens launch and route nav | Needs committed worksheet evidence  |

## Behavioral test harness plan

Add behavior tests in small, low-maintenance slices instead of installing a broad stack all at once.

1. **Pure TypeScript unit harness:** add Vitest when there is a pure helper worth locking down, expose it as `pnpm test:unit`, and focus on deterministic business logic that does not require React Native, Expo modules, Convex network calls, or device state.
2. **Route/component smoke harness:** after the first unit slice is stable, evaluate React Native Testing Library for render-only checks around simple screens/providers. Keep these tests focused on copy, route gating, and empty/loading/error states; avoid brittle style snapshots.
3. **Convex/server harness:** for backend logic, read `convex/_generated/ai/guidelines.md` first and prefer extracted pure validators/helpers before introducing a database-backed harness.
4. **Device smoke harness:** keep Argent/direct `xcodebuild` simulator walkthroughs as the source of truth for navigation/device behavior. Convert repeated manual walkthroughs into a saved worksheet or flow only after the flow is stable.
5. **Validation integration:** do not add slow or flaky device checks to `tools/agent_validate`; keep the default gate to format/lint/typecheck/diff and document extra behavior commands in this inventory.

First candidate slice: identify or extract one small pure validator/helper, add Vitest plus `pnpm test:unit`, and prove the test fails for an intentional local mutation before trusting it.

## False-confidence audit prompts

Does the test fail for the bug it claims to cover? Does it assert behavior rather than implementation trivia? Did mocks remove the real risk?
