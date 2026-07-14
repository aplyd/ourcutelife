# 02-03 Date plan item-key backfill plan

Updated: 2026-07-13T01:43:06-07:00

## Scope

Plan the safe follow-up for existing `datePlans` documents that predate the optional `itemKey` field. The current code writes `itemKey` for newly generated/demo dates and checks the `by_couple_and_item_key` index before falling back to a bounded legacy scan, so old rows keep working without an immediate migration.

## Current behavior

- New generated single-item and pair dates persist `itemKey = createDatePlanItemKey(itemIds)`.
- Demo/test partner seed dates persist `itemKey` when inserted.
- Dedupe checks the indexed key first, then scans recent legacy rows by `coupleId` and compares canonicalized `itemIds`.
- Existing rows without `itemKey` are still readable and can still block duplicate creation while they remain inside the fallback scan window.

## Recommended backfill shape

1. Add a batch-limited internal mutation, not a public mutation, that:
   - reads a small page of `datePlans` ordered by `by_couple_and_created_at`,
   - skips rows that already have `itemKey`,
   - computes `createDatePlanItemKey(date.itemIds)`,
   - patches only `itemKey`,
   - returns `{ patched, skipped, continueCursor }` or schedules the next batch if using a scheduler-driven migration.
2. Run first against a disposable/local Convex environment and record before/after counts.
3. Run staging/test only after local validation passes.
4. Do not run against production without Austin approval.

## Verification target before any live run

- Unit coverage for `createDatePlanItemKey` edge cases remains passing.
- `pnpm typecheck` validates the internal mutation and schema types.
- `pnpm lint` and `pnpm format:check` pass.
- A dry-run/log-only mode or local Convex run proves the patch count and no-op behavior on already-keyed rows.
- Current no-live-service validation path: `previewDatePlanItemKeyBackfill` computes deterministic would-patch rows from in-memory fixtures, and unit coverage verifies missing-key patch counts plus no-op behavior for already-keyed rows without calling Convex or any external service.

## Rollback / safety notes

- The migration only writes a deterministic optional string derived from existing `itemIds`.
- No deletes, auth changes, or live-service setting changes are needed.
- If duplicate legacy rows already exist, this backfill alone should not collapse or delete them; handle dedupe cleanup as a separately approved data operation.
