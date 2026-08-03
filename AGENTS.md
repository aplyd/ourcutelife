<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

Agent hook: before committing or pushing code changes, run `pnpm format:fix` so CI does not fail on formatting drift. This repository also includes `.githooks/pre-commit`; enable it in local clones with `git config core.hooksPath .githooks`.

<!-- convex-ai-end -->

# Lightweight engineering workflow

- Read `AGENT_WORKFLOW.md` for the default execution loop.
- Start with a short objective and acceptance criteria. Inspect only the code and project documents relevant to that objective.
- Existing `.planning/` files remain useful roadmap/history, but they are not mandatory reading or per-session bookkeeping.
- Use full GSD phase planning only for multi-week initiatives, major migrations, sensitive data/billing work, or several dependent workstreams.
- Apple Notes and Reminders are optional intake surfaces, not state mirrors. Do not duplicate routine progress across them and `.planning/`.
- For mobile/React Native/Expo/UI work, use Argent simulator/device tooling for inspection and verification when available. Include concrete route, accessibility-tree, gesture, or screenshot evidence.
- Run relevant automated checks and runtime verification. Use an independent review before shipping meaningful or high-risk changes, not after every trivial slice.
