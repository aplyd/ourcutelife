# 04-15 — Surprise picker Back accessibility audit

Date: 2026-07-20
Status: Closed with focused coverage and Argent proof

## Outcome

The next bounded accepted-spec Phase 4 slice should make the visible Back action on the Plans surprise picker an explicit native button while retaining its existing `router.back()` behavior.

This is an accessibility-only slice. It must not change selected categories, surprise results, plan-item privacy, routing, copy, styling, fixtures, persistence, or backend behavior.

## Why this is the next slice

The accepted Plans flow includes a category-based surprise picker reached from the Plans root. The route and category controls are usable, but `src/app/(sheet)/plans/random.tsx` renders Back as a `Pressable` with no explicit accessibility role or stable action label.

Fresh Argent inspection reproduced the visible Back control as a generic group rather than a button:

- Public inspection: `AXGroup "Back"`
- Native inspection: `label: "Back"`, `traits: []`

The five category toggles on the same route already expose explicit button and selected traits. Closing the remaining Back mismatch is a small, isolated accessibility improvement to a verified core Plans path.

## Bounded implementation contract

1. Add `accessibilityRole="button"` and `accessibilityLabel="Back to Plans"` to the existing Back `Pressable` in `src/app/(sheet)/plans/random.tsx`.
2. Keep the existing `router.back()` handler unchanged.
3. Add focused source-contract coverage binding the accessible button metadata to the retained handler.
4. Do not change category selection, result queries, privacy, copy, layout, styling, fixtures, persistence, or backend behavior.

## Non-destructive Argent verification contract

1. Launch the mock-auth app and open Plans (`/plans`).
2. Activate `Open surprise plan item picker` to reach `/plans/random`.
3. Accessibility inspection must expose `Back to Plans` as a native button.
4. Confirm Food and Activity remain selected and the surprise result remains visible.
5. Activate only `Back to Plans` and require the Plans-root marker `Our date board`.
6. Screenshot target: Surprise picker with Back, category filters, and one result visible.
7. Require no warnings or errors in the connected debugger log registry.

## Audit evidence

- Device: iPhone 17 Pro, iOS 26.5.
- Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`.
- Bundle: `com.ourcutelife.app`, installed mock-auth runtime.
- Route: Plans (`/plans`) → Surprise picker (`/plans/random`).
- The installed app launched successfully; the connected debugger resolved `/Users/austinftacnik/dev/ourcutelife` with 9 loaded scripts and a ready source map.
- Public and low-level native accessibility inspection independently reproduced the generic-group Back control with no button trait.
- Food and Activity exposed native selected button state; the existing surprise result was visible.
- Debugger log registry: 0 entries.
- Navigation into the picker was the only action. No filter changed, no form submitted, no backend mutation ran, and no application code changed.
- Screenshot: `.planning/artifacts/2026-07-20-surprise-back-accessibility/surprise-picker.png`.
- Screenshot SHA-256: `202276e36dbe8c7c056d7a63623e4de210460b965a84af7195a0545ab433ec3c`.

## Completion evidence

- Added only `accessibilityRole="button"` and `accessibilityLabel="Back to Plans"` to the retained `router.back()` Pressable.
- Focused source-contract coverage was captured RED in the full suite at 49/50 and GREEN at 50/50.
- Full typecheck passed; lint reported 0 warnings/errors; targeted formatting and `git diff --check` passed.
- After a clean mock-auth app restart on iPhone 17 Pro / iOS 26.5, Plans → Surprise picker exposed public `AXButton "Back to Plans"` and native `traits: ["button"]`.
- Food and Activity remained native selected buttons, and `Sunset picnic QA date` remained visible. No category or result changed.
- Activating only `Back to Plans` returned to the Plans-root `Our date board` marker.
- The connected debugger resolved this repository and reported 0 log entries.
- Completion screenshot: `.planning/artifacts/2026-07-21-surprise-back-accessibility/surprise-picker.png`.
- Completion screenshot SHA-256: `3accdcff8ef9e68649a3a4889f9b1c85e7ab4e4f12a7084ca2d87cb2f5797ca7`.
