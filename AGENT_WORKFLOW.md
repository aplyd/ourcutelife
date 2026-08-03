# Agent Workflow

## Default loop

1. Read `AGENTS.md`, inspect `git status --short --branch`, and preserve existing work.
2. Restate the objective and concise acceptance criteria; inspect only relevant code and context.
3. Use the runtime's native plan tracker for multi-step work. Do not create GSD phase packets for routine changes.
4. Implement the smallest coherent, reversible solution.
5. Run focused tests, typecheck/lint/build as appropriate, and `git diff --check`.
6. Run the app when behavior is user-visible. Mobile/UI work should use Argent simulator/device evidence when available.
7. Review the final diff. Request an independent review for meaningful, security-sensitive, data-sensitive, billing, or release-bound work.
8. Commit coherent changes when authorized and report changed files, checks, runtime evidence, and remaining risks.

## Planning policy

- `.planning/` is an optional durable roadmap and historical reference, not mandatory per-turn context.
- Update a concise roadmap only when priorities, scope, decisions, or durable status materially change.
- Use full GSD planning for multi-week initiatives, major migrations, billing/data-integrity work, or several dependent workstreams.
- Do not mirror routine state into Apple Notes or Reminders; use them only as optional intake.

## Definition of done

Changed files are intentional, relevant automated checks pass or blockers are explicit, user-visible behavior is exercised when practical, and the final report is grounded in real output.
