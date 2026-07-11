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

## False-confidence audit prompts

Does the test fail for the bug it claims to cover? Does it assert behavior rather than implementation trivia? Did mocks remove the real risk?
