# 01-04 Route/screen audit — Phase 1 and remaining primary surfaces

Updated: 2026-07-12T10:11:36-07:00

## Scope

Audit the app-router surfaces against `docs/product-spec-relationship-app-restructure.md` without changing runtime code. This complements `01-03-PHASE1-GAP-AUDIT.md` by checking the remaining primary tab files and leftover tab-directory routes.

Files inspected:

- `src/app/(tabs)/_layout.tsx`
- `src/app/(tabs)/index.tsx`
- `src/app/(tabs)/chat.tsx`
- `src/app/(tabs)/plans.tsx`
- `src/app/(tabs)/me.tsx`
- `src/app/(tabs)/swipe.tsx`
- `src/app/(tabs)/review.tsx`
- `src/app/(sheet)/plans/new.tsx`
- `src/app/(sheet)/plans/random.tsx`
- `src/app/plans/history.tsx`
- `src/app/plans/match/[category].tsx`

## Findings

### Phase 1 surfaces still align

- `src/app/(tabs)/_layout.tsx` exposes exactly four native tab triggers: `Today`, `Chat`, `Plans`, and `Me`.
- Today still contains the accepted Phase 1 sections: relationship duration, daily prompt, weekly game/quiz cards, recent moments, and Add Moment FAB.
- Today routes prompt answers through `/prompts/today` and moment creation/history/detail through the moment routes, keeping prompts separate from journal moments.
- Me contains the expected profile, relationship, theme/settings, sign-out, and confirmed/non-destructive leave-couple placeholder surfaces.

### Remaining route/spec mismatches to resolve before calling navigation fully clean

1. **Legacy tab-directory routes are now guarded:** `src/app/(tabs)/swipe.tsx` and `src/app/(tabs)/review.tsx` remain as compatibility route files, but they now immediately redirect to accepted product surfaces instead of exposing stale tab-directory screens.
   - `/swipe` redirects to `/plans`, where Phase 2 plan-item/date work is consolidated.
   - `/review` redirects to `/chat`, matching the spec direction that AI-mediated reflection/review belongs under Chat when revived.
2. **Plans root is Phase 2+ rather than Phase 1-only:** `src/app/(tabs)/plans.tsx` already includes Our Dates/date-leaderboard behavior from the date-plans restructure. That is acceptable for Phase 2 work, but Phase 1 acceptance should not rely on Plans root visual QA beyond confirming the Plans tab exists and does not crash.
3. **Argent/device proof now covers the remaining Today route taps:** direct `xcodebuild` plus Argent reinstall/launch previously verified the four bottom tabs and the Today Add Moment sheet on iPhone 17 Pro / iOS 26.5 with mock auth. The latest Argent run additionally verified that Today `Answer prompt` opens the daily prompt sheet and `Recent moments` → `See all` opens the `/moments` history screen.

## Suggested next safe action

Phase 1 navigation is visually verified enough to move forward. Next safe work is either a small Phase 2 Plans/date-plan audit slice or a narrowly scoped fix if another simulator/dev-build issue appears.

## Verification

- Code/docs slice verification: `pnpm typecheck` passed.
- Code/docs slice verification: `pnpm format:check` passed.
- Code/docs slice verification: `git diff --check` passed.
- Review: `tools/agent_review` passed with no obvious added-line security patterns.
- Device verification: `EXPO_PUBLIC_MOCK_AUTH=1 xcodebuild -workspace ios/ourcutelife.xcworkspace -scheme ourcutelife -configuration Debug -destination 'id=F736E64F-ED8F-475C-BD05-7C156B568F74' -derivedDataPath ios/build build` passed with `** BUILD SUCCEEDED **`.
- Device verification: Argent `reinstall-app` and `launch-app` passed for `com.ourcutelife.app` on iPhone 17 Pro / iOS 26.5.
- Device verification: Argent described Today, Chat, Plans, and Me tab screens and the Today Add Moment sheet.
- Device verification: Argent launched `com.ourcutelife.app`, scrolled Today so `Answer prompt` was clear of the tab bar, tapped it, and described the daily prompt sheet with `Write your answer…` and `Submit answer` visible.
- Device verification: Argent dismissed the prompt sheet, tapped `Recent moments` → `See all`, and described the `/moments` screen with `MOMENTS`, `Your private relationship journal`, `Log a moment`, and the mock `GOOD` timeline item visible.

## 2026-07-18 bounded follow-up audit — remaining Phase 1 surfaces

### Scope and evidence

No runtime code was changed. This pass re-read the remaining accepted-spec surfaces outside the recently audited Plans work:

- `src/app/(tabs)/index.tsx` and the Today-linked prompt, weekly game, quiz, moment history/detail/new/edit routes
- `src/app/(tabs)/chat.tsx` and `convex/chat.ts` / `convex/chatActions.ts`
- `src/app/(tabs)/me.tsx` and the profile/anniversary sheets
- `docs/product-spec-relationship-app-restructure.md`

Today and Me still expose the accepted sections and routes. Chat still preserves invoked-only AI: normal messages do not set `asCoachPrompt`, while an explicitly selected coach mode does. The accepted Chat MVP, however, names three explicit coach affordances: `Ask coach`, `Rephrase before sending`, and `Help us talk about this` (spec lines 110–117). The composer currently renders only `Normal`, `Ask coach`, and `Rephrase` (`src/app/(tabs)/chat.tsx` lines 134–153); there is no `Help us talk about this` control or equivalent user-facing state. Existing backend handling already accepts a generic explicit coach prompt (`convex/chat.ts` lines 31–57 and `convex/chatActions.ts` lines 16–29), so the missing affordance can remain a small bounded UI/action-intent slice rather than an AI architecture change.

### Exactly one recommendation for the next worker

Add the missing explicit `Help us talk about this` Chat composer mode, keep it user-invoked, and make all composer modes expose their selected state. Do not add proactive coach behavior or refactor the chat backend.

Argent verification contract for that later UI slice:

1. Launch the mock-auth app and select the `Chat` tab (`/chat`).
2. Accessibility inspection must expose buttons named `Normal message`, `Ask coach`, `Rephrase before sending`, and `Help us talk about this`; exactly one must carry the native `selected` state, initially `Normal message`.
3. Tap `Help us talk about this`; it alone must become selected. Enter a short message and verify the enabled send action remains explicitly user-triggered (no coach message before Send is tapped).
4. Screenshot target: the Chat composer with `Help us talk about this` visibly selected and the drafted message still unsent.
5. After the interaction, check the connected debugger log registry and require no new warnings or errors.

This is the highest-value remaining Phase 1 mismatch found in the bounded pass because it is an explicitly accepted, user-facing invoked-AI path that is absent, while the other inspected Phase 1 jobs remain represented and routable.

## 2026-08-06 bounded follow-up audit — Chat

The earlier Chat finding is now resolved in the current local baseline. The composer exposes all four accepted modes — `Normal message`, `Ask coach`, `Rephrase before sending`, and `Help us talk about this` — and gives each mode an explicit native selected state. Normal messages remain the only non-coach path; every coach mode is selected by the user before Send, and the composer returns to Normal only after a successful send.

Argent on iPhone 17 Pro / iOS 26.5 opened Chat from Today and exposed all four controls as native buttons. Selecting `Help us talk about this` visibly highlighted only that mode; entering `We keep missing each other on chores.` left the draft unsent and enabled the explicit Send action. The existing thread still contained only its original mock coach message, so choosing the mode or drafting text did not proactively invoke the coach. No runtime code changed in this audit.

## 2026-08-07 bounded follow-up audit — Surprise picker

The Surprise picker still exposes all five accepted category toggles and returns at most one bounded, privacy-safe plan item per selected category. It does not, however, implement the accepted submission interaction. `Roll the dice` is only a heading: the route queries immediately from the current toggle state, renders results automatically, and exposes no button that lets the couple roll or reroll the same selected categories. Because query arguments do not change for a same-category reroll, there is no user action that deliberately asks for a fresh set of picks.

Argent on iPhone 17 Pro / iOS 26.5 opened `/plans/random` in the mock-auth build and exposed only `Back to Plans` plus the five category toggle buttons; the existing mock pick was already visible without any submission. Screenshot evidence is retained at `.planning/artifacts/2026-08-07-surprise-picker-audit/current-auto-picks.png` (SHA-256 `19f8ac151a8689fc03889c0dbae07d401b9e9a6f54d0dba16e8fea4eefe384b9`). Metro had no CDP target during this installed-build audit, so no clean debugger-log claim is made.

Exactly one recommended next slice: add an explicit named `Roll surprise picks` action that submits the currently selected non-empty category set and can reroll the same set on demand. Keep the existing one-result-per-category boundary, private-until-mutual projection, and empty-state honesty unchanged; do not broaden into Quality Time discovery or backend migration work.

## 2026-08-07 bounded implementation follow-up — explicit roll/reroll

The bounded UI implementation is now present in the local worktree. `/plans/random` no longer queries or renders a pick before submission. A named native `Roll surprise picks` button submits the selected non-empty categories; after a completed roll it becomes `Reroll surprise picks`. Changing a category clears the prior submitted result. The action is disabled for an empty selection and while loading, exposes matching native accessibility disabled state plus busy state, and retains the exact `No picks in those categories yet.` empty copy after a completed empty response. Same-set rerolls advance the frontend query argument identity without changing the existing `plans.randomByCategories` backend, whose category dedupe, at-most-one-per-category behavior, and `publicIdea(..., false)` private projection remain untouched.

Focused source coverage was captured RED at 0/3 and GREEN at 3/3. Full unit coverage passed 168/168, TypeScript passed, lint completed with 0 errors and the four preserved `convex/prompts.ts` warnings, targeted formatting passed, and `git diff --check` passed. No Convex/backend/generated file changed.

Argent mock-auth verification on iPhone 17 Pro / iOS 26.5 opened the exact `ourcutelife:///plans/random` route. Public AX inspection reported `AXButton "Roll surprise picks"`; before submission no result card was present. Emptying the selected set retained the disabled visual state. Selecting only Food and activating Roll produced exactly one result card and changed the action to Reroll; activating Reroll again retained exactly one result card. The deterministic mock exposes only one plan fixture, so a changed title is not claimed. The post-gesture debugger registry contained 0 entries. Screenshots and hashes are retained under `.planning/artifacts/2026-08-07-surprise-picker-audit/`; detailed evidence is in `explicit-roll-verification.md`.

Complete runtime accessibility verification is **not** claimed. Native devtools repeatedly remained disconnected (`connected: false`, `requiresRestart: true`) and `native-describe-screen` returned `restart_required` even after app restarts, so native disabled/busy trait evidence could not be retained; synchronous mock resolution also made the busy interval too brief to capture through public AX inspection. The next safe action for this slice is verification-only: retry app-scoped native injection and retain disabled and busy accessibility-state evidence without changing product/backend behavior.

## 2026-08-07 verification-only follow-up — disabled submission gate

The requested native-injection retry was completed on the existing mock-auth iPhone 17 Pro / iOS 26.5 simulator without changing application code. An Argent restart and a separate simulator terminate plus Argent launch both reported successful app launches, but native devtools remained `connected: false` / `requiresRestart: true`, and `native-describe-screen` again returned `restart_required`. Native disabled/busy trait capture is therefore still unavailable, and the synchronous mock query still resolves too quickly for a reliable busy-state observation.

Public accessibility and runtime behavior did provide stronger disabled-gate evidence. The route exposed `Roll surprise picks` as an `AXButton`. After both initially selected categories were cleared, tapping the inactive Roll surface left the Roll action unchanged, did not expose `Reroll surprise picks`, and rendered no result. This verifies that an empty category set cannot submit even though the lower-level native trait endpoint remains blocked. Treat the remaining gap as an Argent native-injection evidence limitation rather than a reproduced product failure; do not repeat the same restart sequence unless the native tooling or build changes.

## 2026-08-07 native-stack modal-isolation evaluation

The remaining `/plans/new` form-sheet accessibility concern was tested at the native-stack presentation boundary rather than with another child-view prop. A temporary change from `presentation: "formSheet"` to `presentation: "modal"` built successfully, reinstalled on the mock-auth iPhone 17 Pro / iOS 26.5 simulator, and opened through `ourcutelife:///plans/new`. The plan form rendered in the modal presentation, but Argent's live accessibility tree still included underlying Today content, `Add a moment`, the daily-prompt action, and all four tab buttons. The native-stack presentation change therefore did not isolate the active screen.

The installed `react-native-screens` 4.25.2 implementation exposes no stack-screen accessibility-isolation prop and contains no stack-screen handling for `accessibilityViewIsModal`; that behavior exists only on its separate full-window-overlay container. The temporary presentation change was reverted to the accepted `formSheet`. Treat this as a current navigation-stack/tooling limitation rather than a safe app-level fix, and do not continue cycling presentation modes unless the dependency or native tooling changes. The next safe action is a different bounded Phase 1 route/screen/component audit.

## 2026-08-07 bounded follow-up audit — Today Together For

### Scope

Exactly one accepted Phase 1 component was audited without changing product, test, or backend code: the Today tab's `Together For` duration card. The accepted spec requires animated rolling numbers presented as segmented years, months, weeks, days, hours, minutes, and seconds (`docs/product-spec-relationship-app-restructure.md` lines 57–69). Source inspection covered `src/app/(tabs)/index.tsx` lines 12–39 and 117–150 plus the installed `react-native-animated-rolling-numbers` behavior visible through Argent.

### Finding

The visual component has all seven accepted segments and updates once per second, but its animated digits are not a coherent accessibility representation. Each segment renders `AnimatedRollingNumber` without an accessibility wrapper or hidden animated descendants (`src/app/(tabs)/index.tsx` lines 136–148). In the clean Today public AX tree, Argent exposed the transition glyphs as dozens of separate `AXStaticText` nodes (`0`, `1`, `2`, and so on), frequently overlapping at the same coordinates, before exposing the separate labels `YEARS`, `MONTHS`, `WEEKS`, `DAYS`, `HOURS`, `MINUTES`, and `SECONDS`. It did not expose a stable value such as `5 years` for any segment. A second inspection several seconds later exposed a different, still-fragmented set of digits, confirming this was the live rolling-number representation rather than a one-time startup artifact. This makes the accepted relationship snapshot effectively unintelligible in public accessibility output even though it is visually present.

### Exact non-destructive runtime evidence

- Device/build: existing deterministic mock-auth `com.ourcutelife.app` on iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`); no live Convex/provider was contacted and no control that writes data was activated.
- Route: launched the app and opened `ourcutelife:///`. A previously open `/plans/new` form sheet was initially restored; tapping its public `dismiss popup` backdrop only dismissed that sheet. The subsequent public AX capture was a clean Today surface with no plan-form fields.
- Clean public AX markers: `TODAY`, `TOGETHER FOR`, `You and Test Partner have been together for…`, all seven unit labels, `Answer today's daily prompt`, and the four tab buttons. Around the duration card, the same capture exposed more than 90 independent digit nodes rather than seven named values; examples include overlapping `AXStaticText "0"`, `"1"`, `"2"`, etc. at normalized y positions `0.251`–`0.712`.
- Visual capture succeeded at 362×787; its transient screenshot SHA-256 was `4cfe5eb61e0d50bac5ace2467c271f1fbb92af5b2c9cd53907cc5d79316f7153`. It was not copied into the repository because this audit is restricted to the two planning documents and the AX transcript is the relevant failure evidence.
- Native inspection limitation: before and after an Argent-managed restart, native devtools remained `connected: false`, `requiresRestart: true`; `native-describe-screen` returned `restart_required`. No app-scoped native trait claim is made.
- Debugger limitation: `debugger-status` and `debugger-log-registry` both failed because Metro port 8081 had no CDP target. The public tree displayed `!, Open debugger to view warnings.`, so this audit does **not** claim ready source maps or a clean warning/error registry. The warning could not be attributed from the installed build in this pass.

### Exactly one recommendation for the next bounded implementation slice

Preserve the accepted visual rolling animation, but replace its public accessibility output with one stable named value per duration segment (for example, `5 years`): hide each `AnimatedRollingNumber` glyph subtree from accessibility and expose the current number plus unit on its segment container. Do not mark the per-second seconds update as a live region, so VoiceOver is not interrupted every second. Bound the slice to the Today `Together For` component and focused accessibility coverage; do not alter duration arithmetic, anniversary persistence, other Today cards, navigation, or backend behavior.

Verification contract for that later slice: on exact `/`, public AX must expose exactly seven coherent segment values and no standalone transition digits from the rolling-number library; visual animation must remain present; after waiting through a seconds transition, the tree must remain seven coherent values; retry app-scoped native inspection only if injection connects; and require debugger source maps plus a warning/error investigation before claiming a clean runtime.

## 2026-08-07 bounded implementation follow-up — Today Together For accessibility

The Today relationship-duration card now preserves all seven rolling visual segments while exposing each segment as one coherent accessibility value. The animated number and visible unit remain unchanged visually, but their glyph subtree is hidden from accessibility; the segment container supplies the current number with a singular or plural unit. No live region was added, so the once-per-second update does not proactively interrupt VoiceOver. Duration arithmetic, anniversary persistence, navigation, backend behavior, and every other Today card remain unchanged.

Focused coverage was captured RED within the full unit suite at 168/169, then passed GREEN at 169/169. TypeScript passed; lint completed with 0 errors and the four preserved `convex/prompts.ts` warnings; targeted formatting and whitespace checks passed. A forced-bundle mock-auth Debug build completed with `BUILD SUCCEEDED`, and Argent reinstalled the resulting app on iPhone 17 Pro / iOS 26.5.

On exact Today, public AX exposed exactly `4 years`, `5 months`, `2 weeks`, `4 days`, `10 hours`, `35 minutes`, and `40 seconds`, with no standalone rolling glyphs or separate unit nodes. A second capture after the animation advanced exposed the same seven coherent segments with `50 seconds`, again with no glyph fragments. The visual screenshot retains the rolling-number cards at `.planning/artifacts/2026-08-07-together-for-accessibility/today.png` (SHA-256 `f8a7684fa8025fad9d9cc20c8d8bdf7acddd30ab975510ed6fcda92d598c6a42`). Metro still had no CDP target and native devtools remained disconnected, so no source-map, debugger-log, or low-level native-trait claim is made. No live service/data, provider, credential, deployment, migration, commit, or push changed.

## 2026-08-07 bounded follow-up audit — native bottom tab bar

Exactly one different accepted Phase 1 component was audited without changing product, test, or backend code: the native `Today | Chat | Plans | Me` bottom tab bar. Source defines exactly those four labeled triggers in `src/app/(tabs)/_layout.tsx` lines 24–54, but their SF Symbol icon children are also public accessibility elements. On exact mock-auth route `ourcutelife:///me`, Argent's public AX tree exposed the four correct `AXButton` labels and four additional `AXTextField` nodes named `heart.text.square`, `conversation`, `checklist`, and `person`. The redundant implementation-oriented symbol names make the accepted primary navigation noisier and potentially confusing for assistive-technology users.

Runtime evidence used the existing `com.ourcutelife.app` installation on iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`). No tab action beyond opening the exact non-destructive route was activated. A transient 362×787 screenshot was captured at `/tmp/ourcutelife-me-audit.png` (SHA-256 `61eebee89403af266d459cb204074fd232df635757e303c44c1448829af2446d`) and was not added to the repository. Native devtools reported `connected: false`, `requiresRestart: true`; Metro port 8081 had no CDP target, so no low-level native-trait, source-map, or clean debugger-log claim is made.

Exactly one recommended next slice: preserve the four visual SF Symbols and native tab behavior while removing the icon children from the public accessibility order, leaving only the named `Today`, `Chat`, `Plans`, and `Me` tab buttons. Keep the slice inside the native-tabs layout and focused accessibility coverage; do not change route names, tab count/order, screen content, navigation architecture, or backend behavior.

Future verification contract: open exact `/me` in the deterministic mock-auth iOS build; public AX must expose exactly four tab-bar controls named `Today`, `Chat`, `Plans`, and `Me`, with no separate symbol-name nodes; tapping one non-destructive alternate tab and returning to Me must retain that four-control model and identify the current tab if the public/native API makes selection state inspectable. Retain one screenshot showing unchanged visual icons. Retry app-scoped native inspection only if injection connects, and require debugger source maps plus a warning/error-registry check before claiming a clean runtime.

## 2026-08-07 native bottom tab accessibility-label evaluation

The smallest supported native-tabs candidate was evaluated and rejected rather than retained. Each `NativeTabs.Trigger` temporarily passed its visible label through `unstable_nativeProps.tabBarItemAccessibilityLabel`, with focused source coverage. The candidate typechecked and the complete unit suite passed 170/170. A fresh mock-auth Metro session, Debug rebuild/reinstall, and app launch on iPhone 17 Pro / iOS 26.5 rendered the expected Today screen and visually unchanged native tabs.

Argent public AX still exposed the same four named tab buttons plus the four redundant `AXTextField` symbol nodes (`heart.text.square`, `conversation`, `checklist`, and `person`). `tabBarItemAccessibilityLabel` therefore labels the tab item but does not hide the native SF Symbol child produced by the installed Expo Router / react-native-screens stack. The candidate and its regression test were removed, restoring the pre-evaluation runtime source. Do not retry trigger-level item labels as a solution. A future implementation needs either a supported native icon-hiding API/dependency fix or a separately proven icon rendering path that preserves the accepted visuals and native-tab architecture.

## 2026-08-12 native bottom tab image-source implementation

The separately proven icon-rendering path is now retained. The native tab layout still uses exactly four `NativeTabs.Trigger` routes in the accepted Today, Chat, Plans, Me order, but supplies equivalent 50×50 template PNGs generated from the same SF Symbols through the supported `src` icon path. This preserves native tabs, selected/unselected icon variants, tinting, labels, and visual symbol shapes while preventing the raw SF Symbol identifiers from becoming separate public accessibility nodes.

A fresh mock-auth Debug build completed with `BUILD SUCCEEDED`, was installed on iPhone 17 Pro / iOS 26.5, and opened exact `ourcutelife:///me`. Argent public AX exposed the `Tab Bar` group and exactly four controls: `AXButton "Today"`, `"Chat"`, `"Plans"`, and `"Me"`. No separate `heart.text.square`, conversation-symbol, `checklist`, or `person` nodes were present. Tapping Today and returning to Me retained that same four-control model. The retained screenshot is `.planning/artifacts/2026-08-12-native-tab-accessibility/me.png` (SHA-256 `a13046622b9ccbc8c1ea9d504fd620a7573783c6c725874930b766c6c717ac11`) and shows the visual icons intact.

Full unit coverage passed 169/169, TypeScript passed, lint completed with 0 errors and four preserved `convex/prompts.ts` warnings, targeted formatting passed, and `git diff --check` passed. No backend/live service, provider, credential, deployment, migration, commit, or push changed.

## 2026-08-12 bounded implementation follow-up — Apple sign-in accessibility

The signed-out landing screen's single Apple sign-in action now exposes the stable native name `Continue with Apple`, explicit button semantics, and accessibility disabled/busy state that mirrors the existing signing-in/session-pending gate. The Apple authentication request, Better Auth exchange, requested scopes, callback, secure-session copy, and error handling are unchanged.

Focused coverage was captured RED at 169/170 and passed GREEN at 170/170. TypeScript passed; lint completed with 0 errors and the four preserved `convex/prompts.ts` warnings; targeted formatting and whitespace checks passed. Runtime interaction was intentionally not attempted: the deterministic mock-auth build starts authenticated and redirects away from `/auth`, while completing Apple sign-in would cross the account-auth boundary. A later verification-only pass may inspect the untouched action in a deliberately signed-out non-mock simulator build without activating it.

## 2026-08-13 bounded implementation follow-up — New Moment tag accessibility

The New Moment form's eight suggested tag chips now expose explicit button semantics, a stable `Toggle {tag} moment tag` name, and native selected state matching the existing `tags.includes(tag)` value. Tag selection, moment fields, Save gating, private storage behavior, and backend mutations are unchanged.

Focused coverage was captured RED within the full suite at 173/174 and passed GREEN at 174/174. Full TypeScript passed; targeted formatting and whitespace checks passed. On exact mock-auth `/moments/new`, Argent public AX exposed all eight tag choices as named buttons and retained `Save private moment`. Selecting only `communication` exercised the disposable form state without saving a moment or contacting live data. Visual evidence is `.planning/artifacts/2026-08-13-new-moment-tag-accessibility/tags.png` (SHA-256 `254875845b4528f0f607960071a4be42c06d8370eb46a8ded7ac3010f249cd79`). The public AX tree also retained underlying Today/tab content, consistent with the previously documented native form-sheet isolation limitation; no modal-isolation claim is made.

## 2026-08-13 bounded implementation follow-up — New Moment repair-reflection accessibility

The two conditional Repair reflections inputs now expose distinct stable native names: `What your partner could have done differently` and `What you could have done differently`. Their visibility gate, local values, save payload, private storage behavior, layout, and backend mutations are unchanged.

Full unit coverage passed 175/175, TypeScript passed, and targeted formatting plus whitespace checks passed. On exact mock-auth `/moments/new`, selecting only Hard revealed both names in Argent public AX. Neither field was edited and Save was not activated. Visual evidence is `.planning/artifacts/2026-08-13-new-moment-repair-accessibility/repair-reflections.png` (SHA-256 `73b6edfa37c0f6492cd07ef656e37189a0d1410dfbe14aa06125f6b87519ea4b`). The public AX tree retained underlying Today/tab content, consistent with the documented native form-sheet isolation limitation; no modal-isolation claim is made.

## 2026-08-13 bounded follow-up audit — Today Together For avatars

Exactly one different accepted Phase 1 component was audited without changing product, test, or backend code: the two overlapping avatar circles in Today’s `Together For` card. The accepted spec requires two overlapping avatar circles, but the current implementation renders one circle as the text `You` and the partner circle as a generic heart (`♥`). No user or partner avatar image is rendered, even when profile avatar data is available, so the relationship snapshot does not visually identify the couple as specified.

The same implementation also exposes `You` and `♥` as separate static text in VoiceOver. The heart has no partner meaning, and both nodes duplicate the adjacent sentence, `You and Test Partner have been together for…`, adding noise without a coherent avatar description.

Argent opened exact mock-auth `ourcutelife:///` on iPhone 17 Pro / iOS 26.5 after dismissing the previously restored New Moment sheet. The public accessibility tree exposed `AXStaticText "You"`, `AXStaticText "♥"`, the adjacent couple sentence, and the seven already-correct coherent duration values. No interactive control or mutation was activated. Evidence is retained in `.planning/artifacts/2026-08-13-together-for-avatar-audit/`: `accessibility-tree.json` and `today.png` (SHA-256 `8e908e75e2671cac27f03d3cbf634238af14e4f0979a851c197fb672b1dc48d8`).

Exactly one recommended next slice: preserve the overlapping-circle layout, but render the viewer and partner profile images when available with a warm initial fallback for each person. Treat the pair as decorative context for the already complete couple sentence by hiding the avatar descendants from accessibility. Keep the slice inside the Today `Together For` header; do not change duration arithmetic, profile persistence, image upload behavior, navigation, or backend contracts. Verify the deterministic mock fixture visibly renders two distinct warm fallbacks or fixture images, while public AX retains the couple sentence and exposes neither standalone initials nor the generic heart.

## 2026-08-13 bounded follow-up audit — Me profile name

Exactly one different accepted Phase 1 component was audited without changing product, test, or backend code: the profile card on Me. The accepted spec requires the user's name with an edit affordance. The current visual card renders the name inside a non-editable `TextInput` nested under the `Edit name` button, but the button has an explicit accessibility label containing only the action. As a result, VoiceOver exposes `Edit name` without the current profile name, so a user cannot review their displayed identity before deciding whether to edit it.

Argent opened exact mock-auth `ourcutelife:///me` on iPhone 17 Pro / iOS 26.5. Public accessibility exposed `Edit profile photo`, `Tap avatar to update your profile`, and `AXButton "Edit name"`, then moved directly to the Relationship section; neither `Agent User` nor another profile-name value was present. No control or mutation was activated. Evidence is retained in `.planning/artifacts/2026-08-13-me-profile-card-audit/`: `accessibility-tree.json` and `me.png` (SHA-256 `b7b8d59abec1a32d6b958722beb7390c7f902ffc54c7bc0acd01b2bc00443b79`). Debugger evidence is not claimed because the initial CLI calls used the wrong debugger device argument and this read-only audit did not need a retry to establish the accessibility mismatch.

Exactly one recommended next slice: include the current profile name in the existing edit control's accessible name (for example, `Edit name, Agent User`) while retaining the visual name, route, profile persistence, and edit behavior. Keep the slice inside the Me profile card and focused accessibility coverage; do not alter auth, uploads, account actions, or backend contracts. Verify exact mock-auth `/me` exposes one edit-name button containing the current name and no duplicate standalone name node.

## 2026-08-13 bounded implementation follow-up — Me profile name accessibility

The Me profile card's existing edit-name control now includes the displayed profile name in its accessible name while preserving its visual field, route, profile persistence, and edit behavior. VoiceOver users can review their current identity before choosing to edit it, without a duplicate standalone name node.

The source contract was captured RED within the full suite at 176/177, then passed GREEN at 177/177. TypeScript, targeted formatting, and whitespace checks passed. On exact mock-auth `/me`, Argent public AX exposed one `AXButton "Edit name, Agent User"` and then moved directly to Relationship; no duplicate `Agent User` node was present. No control or mutation was activated. Visual evidence is `.planning/artifacts/2026-08-13-me-profile-name-accessibility/me.png` (SHA-256 `f5c1173c73f76eb6be0b379925b1e92cae0aebdc5408b1aeba5c928897367c82`). No backend/live service, auth, upload, account action, deployment, migration, commit, or push changed.
