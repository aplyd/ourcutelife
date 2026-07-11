# Agent Workflow

Summary:

1. This is the repo-local standard workflow for autonomous and interactive agents.
2. Read AGENTS.md first, then this file, then .planning/STATE.md, ROADMAP.md, and DECISIONS.md.
3. Keep .planning/ as canonical state; Notes/Reminders are intake only.
4. Every code session should inspect git status, preserve user work, run the app when relevant, verify with real commands, and update state.
5. Prefer small commits with evidence over large unverified changes.
6. Use independent review for meaningful code changes before or immediately after commit.
7. Improve these docs/tools when a repeated failure or workflow gap appears.

## Required loop

1. Route: read project router docs and canonical planning files.
2. Protect existing work: inspect `git status --short --branch` and understand dirty files before editing.
3. Plan one bounded slice from the roadmap.
4. Implement small, reversible changes and update docs when behavior changes.
5. Run the app when relevant; mobile/UI work should use Argent simulator/device verification when available.
6. Verify with `tools/agent_validate`, targeted checks, and `git diff --check`.
7. Review meaningful code changes with `tools/agent_review` plus an independent reviewer when possible.
8. Commit coherent changes and update `.planning/STATE.md` with evidence, blockers, and next actions.

## Definition of done

A slice is done only when changed files are intentional, validation passed or blockers are recorded, runtime verification happened when relevant, state is current, code is committed locally, and follow-ups are captured outside chat.
