# 04-13 — Private plan-item form accessibility

Date: 2026-07-20
Status: Verified

## Outcome

The private plan-item suggestion form now exposes stable accessible names for its title, description, and optional hashtag/subcategory inputs. `Save private suggestion` is a named native button whose disabled and busy accessibility state follows the existing form validation and save state.

No route, layout, copy, privacy behavior, validation, mutation payload, persistence, or styling changed.

## Automated verification

- Focused source-contract coverage was captured RED before implementation and GREEN afterward.
- `pnpm test:unit` passed 48/48.
- `pnpm typecheck` passed.
- `pnpm lint` passed with no warnings or errors.
- Targeted `oxfmt --check` passed for the form and focused regression test.
- `git diff --check` passed.
- `tools/agent_review` found no obvious added-line security patterns.

## Argent verification

Device: iPhone 17 Pro, iOS 26.5  
Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`  
Route: `/plans/new`

After a clean app restart, Plans → `Add a private plan item` opened the existing `Suggest it safely` sheet. Public and native accessibility inspection reported:

- `Plan item title`
- `Plan item description`
- `Plan item hashtags or subcategories`
- `Save private suggestion` with native `button, notEnabled` traits while required fields were blank
- `Save private suggestion` with native `button` trait after disposable local title and description drafts were entered

Save was not activated, so no mutation ran. Restarting the app discarded the local drafts and restored the empty form. The connected debugger registry contained one normal HeroUI info entry and no warnings or errors.

## Evidence

- Screenshot: `.planning/artifacts/2026-07-20-private-plan-item-form-accessibility/private-plan-item-form.png`
- Screenshot SHA-256: `d8e11ee29ead1f4c0bf1962b3f54100f538c633077cf3f875d8cd5a9d6d4b11c`
- Regression coverage: `tests/unit/private-plan-item-form-accessibility.test.ts`
