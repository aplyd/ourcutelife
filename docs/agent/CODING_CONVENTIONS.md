# Coding Conventions

Summary:

1. Repo-specific conventions for agents and reviewers.
2. Prefer clarity, typed boundaries, and existing patterns.
3. Keep formatting automated; run `pnpm format:fix` before commit.
4. Avoid AI-smell churn: broad renames, noisy comments, unrelated refactors.
5. Convex changes must follow `convex/_generated/ai/guidelines.md`.
6. Promote repeated review comments into this doc, tests, hooks, or tools.
7. Keep commits focused and reversible.

## Rules

- Follow existing Expo Router, Convex, and UI patterns before adding abstractions.
- Do not introduce secrets, production credentials, or live deploy changes.
- Preserve private-until-mutual relationship semantics.
- Do not leave debug logs, commented-out code, or speculative TODOs without tracking them in `.planning`.

## Review focus

Does the change match the product spec? Are private/user-visible states clear? Are edge cases handled safely? Can another agent continue from here?
