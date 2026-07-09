# Phase 1 Context — Relationship App Restructure

Source: `docs/product-spec-relationship-app-restructure.md`

## Locked direction

- Product spine: Today, Chat, Plans, Me.
- Private until mutual.
- AI is invoked, not lurking.
- Daily prompt answers are context, not moments.
- Warm labels over clinical labels.
- MVP placeholders must be honest and non-crashing.

## Open implementation questions

- Which existing screens already match the desired tabs/routes?
- Which routes are missing vs just need copy/layout updates?
- What is the smallest shippable vertical slice for Today + Plans?
- Which flows need Argent simulator screenshots/walkthrough evidence?

## Verification expectations

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- targeted tests/smokes if present
- Argent simulator walkthrough for changed mobile UI flows
