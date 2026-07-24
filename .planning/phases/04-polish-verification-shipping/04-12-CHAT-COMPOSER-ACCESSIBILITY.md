# 04-12 — Chat composer accessibility

Date: 2026-07-20
Status: Verified

## Outcome

The Chat composer now exposes a stable `Chat message` input and a native `Send message` button to assistive technology. The Send button announces its disabled state while the draft is blank or sending and becomes enabled when a nonblank draft exists.

No layout, copy, composer-mode behavior, send handler, backend behavior, or persisted data changed.

## Automated verification

- Focused source-contract coverage was captured RED before implementation and GREEN afterward.
- `pnpm test:unit` passed 47/47.
- `pnpm typecheck` passed.
- `pnpm lint` passed with no warnings or errors.
- Targeted `oxfmt --check` passed for the Chat screen and focused regression test.
- `git diff --check` passed.

## Argent verification

Device: iPhone 17 Pro, iOS 26.5  
Simulator: `F736E64F-ED8F-475C-BD05-7C156B568F74`  
Route: `/chat`

After a clean app restart, public and native accessibility inspection independently reported:

- `Chat message` on the message input
- `Send message` with native `button, notEnabled` traits for the blank draft
- `Send message` with native `button` trait after entering the disposable draft `VoiceOver draft`

Send was not activated, no mutation ran, and restarting the app discarded the local draft. The connected debugger log registry contained 0 entries.

## Evidence

- Screenshot: `.planning/artifacts/2026-07-20-chat-composer-accessibility/chat-composer.png`
- Screenshot SHA-256: `359a4f5010a6e4649e26a78c9b15e4c9ba67d0f188ae7ac05e0539a88a6808da`
- Regression coverage: `tests/unit/chat-composer-accessibility.test.ts`

## Help-us-talk mode closure — 2026-07-23

The accepted fourth composer affordance, `Help us talk about this`, is present and remains explicitly user-invoked. Focused coverage now binds all four accepted mode names to the shared button control, requires the one-mode-at-a-time selected-state expression with `Normal message` as the initial mode, and preserves `asCoachPrompt: mode !== "normal"`.

Fresh mock-auth Argent verification deep-linked to `/chat` on iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`). Public iOS accessibility inspection exposed all four controls as named `AXButton` elements. Tapping only `Help us talk about this` selected its purple visual state. Entering the disposable draft `Can we reset tonight?` enabled the existing send action without producing a new coach message; Send was never tapped. Restarting the app discarded the draft, and the final debugger registry contained 0 entries, warnings, or errors.

- Selected-state screenshot: `.planning/phases/04-polish-verification-shipping/artifacts/04-21/chat-help-mode-selected.png`
- Selected-state SHA-256: `5d0ec358f3ad7b1032695b433372c1a22ad1d5b1963aa36e0ef0270561075e8a`
- Unsent-draft screenshot: `.planning/phases/04-polish-verification-shipping/artifacts/04-21/chat-help-mode-draft-unsent.png`
- Unsent-draft SHA-256: `0cde9d554c6ccf41d9c9790a67ebcc2bd7df1398700bfc9c2abfbe2de4da3f45`
- Both screenshots: 362×787.
- Focused test: 2/2 passed.
- Full unit suite: 76/76 passed.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed with 0 warnings and 0 errors across 106 files.
- Targeted formatting, `git diff --check`, and `tools/agent_review`: passed.
- Native-devtools inspection remained unavailable with `restart_required`; no low-level trait claim is made beyond the independent public iOS `AXButton` evidence.
