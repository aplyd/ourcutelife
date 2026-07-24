# 04-16 — Match history Back accessibility audit

Date: 2026-07-21
Status: Closed with focused coverage and Argent proof

## Outcome

The next bounded accepted-spec Phase 4 slice should make the visible Back action on Matched plan items an explicit native button while retaining its existing `router.back()` behavior.

This is an accessibility-only slice. It must not change match visibility, privacy, filtering, ordering, copy, styling, fixtures, persistence, routing, or backend behavior.

## Why this is the next slice

The accepted Plans flow includes a matched plan-item history route reached from the Plans root and from category matching. Its six category filters already expose descriptive native button names and selected state, but `src/app/plans/history.tsx` renders Back as a `Pressable` without an explicit accessibility role or stable action label.

Fresh Argent inspection reproduced the visible Back control as a generic group rather than a button:

- Public inspection: `AXGroup "Back"`
- Low-level native inspection: the containing `RCTViewComponentView` is labeled `Back` but exposes no button trait.

Closing this mismatch is a small, isolated accessibility improvement to a verified core Plans path.

## Bounded implementation contract

1. Add `accessibilityRole="button"` and `accessibilityLabel="Back to Plans"` to the existing Back `Pressable` in `src/app/plans/history.tsx`.
2. Keep the existing `router.back()` handler unchanged.
3. Add focused source-contract coverage binding the accessible button metadata to the retained handler.
4. Do not change match visibility, privacy, category filtering, ordering, copy, layout, styling, fixtures, persistence, routing, or backend behavior.

## Non-destructive Argent verification contract

1. Launch the mock-auth app and open Plans (`/plans`).
2. Activate `Open matched plan item history` to reach `/plans/history`.
3. Accessibility inspection must expose `Back to Plans` as a native button.
4. Confirm All remains the selected filter and the existing matched plan item remains visible.
5. Activate only `Back to Plans` and require the Plans-root marker `Our date board`.
6. Screenshot target: Matched plan items with Back, all category filters, and one matched item visible.
7. Require no warnings or errors in the connected debugger log registry.

## Audit evidence

- Device: iPhone 17 Pro, iOS 26.5.
- Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`.
- Bundle: `com.ourcutelife.app`, installed mock-auth runtime.
- Route: Plans (`/plans`) → Matched plan items (`/plans/history`).
- The installed app launched successfully; the connected debugger resolved `/Users/austinftacnik/dev/ourcutelife`.
- Public and low-level native accessibility inspection independently reproduced a labeled Back container without native button semantics.
- All six filters remained named native buttons, All retained selected state, and `Sunset picnic QA date` remained visible.
- Debugger log registry: 0 entries.
- Navigation into match history was the only action. No filter changed, no match opened, no form submitted, no backend mutation ran, and no application code changed.
- Screenshot: `.planning/artifacts/2026-07-21-match-history-back-accessibility/match-history.png`.
- Screenshot SHA-256: `125916d27e63d7799dfc4e643d79af115bd4b55a445260a78870ef740c20cd88`.

## Completion evidence

- Added only `accessibilityRole="button"` and `accessibilityLabel="Back to Plans"` to the existing Back `Pressable`; its `onPress={() => router.back()}` handler and all behavior, copy, layout, styling, filtering, fixtures, persistence, routing, privacy, and backend behavior remain unchanged.
- Added `tests/unit/match-history-back-accessibility.test.ts`, which locates the one `Pressable` bound to `router.back()` and requires the direct button role and `Back to Plans` label.
- Focused RED: the isolated test failed 0/1 with `expected a direct accessibilityRole` before the application edit.
- Focused GREEN: the same isolated test passed 1/1 after the application edit.
- Full verification: `pnpm test:unit` passed 51/51; `pnpm typecheck` passed; `pnpm lint` reported 0 warnings and 0 errors; targeted `oxfmt --check` passed on the two slice source files and two planning files; `git diff --check` passed; `tools/agent_review` found no obvious added-line security patterns.
- After a clean mock-auth restart and Metro reload, Argent opened Plans (`/plans`) and activated only `Open matched plan item history` to reach `/plans/history` on iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`).
- Public inspection reported `AXButton "Back to Plans"`; independent native inspection reported label `Back to Plans` with `traits: ["button"]`.
- Native inspection reported `Filter matched plan items by All` with `traits: ["button", "selected"]`; the other five filters remained unselected native buttons, and `Sunset picnic QA date` remained visible. No filter changed and no mutation ran.
- Activating only `Back to Plans` returned to the Plans-root `Our date board` marker.
- The connected debugger resolved `/Users/austinftacnik/dev/ourcutelife`, loaded 10 scripts with a ready source map, and reported two normal startup entries (one log and one info) with 0 warnings and 0 errors before and after Back activation.
- Completion screenshot: `.planning/artifacts/2026-07-21-match-history-back-accessibility-completion/match-history.png`.
- Completion screenshot SHA-256: `b350e50426bcc2e01ed2e71b122a4ff434b2d0f4f3aa807e623196bf87534cf6`.
- No deployment, migration, credentials, external communication, commit, or push occurred.
