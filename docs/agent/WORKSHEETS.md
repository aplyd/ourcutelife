# Agent Worksheets and Verification Tags

Use `.planning/worksheets/TEMPLATE.md` for a meaningful bounded code, UI, migration-plan, or tooling slice. Planning remains canonical; a worksheet is compact execution evidence, not a second roadmap or a substitute for `.planning/STATE.md`.

## Worksheet flow

1. Copy the template to `.planning/worksheets/YYYY-MM-DD-<slug>.md` before implementation when the slice needs durable evidence.
2. Record the starting branch/SHA, relevant dirty files, scope, and protected boundaries.
3. Add exact validation and runtime evidence. Mobile/UI work must include Argent route/device evidence when available, or a concrete environment blocker.
4. Record review findings, Austin-needed decisions, commit/push state, and the next bounded handoff.
5. Mark `verified` only after required checks pass and update `.planning/STATE.md` after meaningful work.

Do not put secrets, credentials, private user data, ephemeral simulator identifiers with no diagnostic value, or fabricated results in worksheets.

## Git tag convention

Verification tags are optional local milestones, not release/deploy markers:

```text
verified/YYYY-MM-DD/<kebab-case-slice>
```

Create an **annotated** tag only when the worksheet is tracked, its recorded commit contains the complete bounded slice, required validation passed, runtime/Argent evidence is present when relevant, and no blocking review finding remains:

```bash
git tag -a verified/YYYY-MM-DD/<slug> <commit> -m "Verified: <outcome>"
```

- Never tag a dirty worktree, an uncommitted slice, or a commit that omits its worksheet/state update.
- Never move, replace, force-push, or remotely push a verification tag without Austin's explicit approval.
- Never use a verification tag to imply production deployment, migration approval, App Store readiness, or release approval.
- If verification later proves incomplete, keep the old tag immutable, document the issue, and create a new tag after a corrective verified commit.
