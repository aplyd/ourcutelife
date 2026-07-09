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

# GSD / loop-engineering conventions

- Use `.planning/` as canonical project roadmap and agent state.
- Treat Apple Notes/Reminders as intake only; normalize useful items into `.planning/INBOX.md`, roadmap, phase context, or task plans before acting.
- Read `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/DECISIONS.md` before deciding next work.
- Update `.planning/STATE.md` after meaningful work sessions.
- For mobile/React Native/Expo/UI work, use Argent simulator/device tooling for inspection and verification when available. Include screenshots, route names, or concrete walkthrough evidence in summaries.
- Specialist agents delegated from the main Hermes profile should work from a bounded plan, run verification commands, and report evidence back for main-agent review.
