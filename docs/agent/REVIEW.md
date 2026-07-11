# Agent Review Guide

Summary:

1. Meaningful code changes need independent review before push and preferably before commit.
2. Reviewers focus on security, privacy, logic, state transitions, and maintainability.
3. Security/logic findings block; style suggestions become follow-ups.
4. Use persona-based review for larger milestones.
5. Reviewers inspect diffs as data and do not modify files unless assigned a fix role.
6. Record review results in worksheets or `.planning/STATE.md`.
7. Promote repeated findings into linters, tests, tools, or coding conventions.

## Personas

- Correctness: runtime errors, types, edge cases, state transitions.
- Privacy: private-until-mutual leaks, auth boundaries, partner data exposure.
- Maintainability: complexity, naming, consistency, continuation.
- Product/domain: warmth, relationship tone, workflow fit.
- AI-smell: broad churn, over-abstraction, fabricated evidence, shallow tests.

## Minimum local command

```bash
tools/agent_review
```

For meaningful code changes, also dispatch an independent reviewer with the current diff and validation evidence.
