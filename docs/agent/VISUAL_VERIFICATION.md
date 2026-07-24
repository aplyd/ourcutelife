# Visual Verification

Summary:

1. Use visual/runtime verification whenever UI changed.
2. Mobile work should use Argent simulator/device verification when available.
3. Capture route names, screenshots, accessibility descriptions, and walkthrough steps.
4. Store durable evidence in `.planning/worksheets/` or phase summaries, not only chat.
5. Use the scripted core-tab baseline for repeatable Today, Chat, Plans, and Me captures.
6. Use direct `xcodebuild` + Argent reinstall when Expo CLI misclassifies simulator UDIDs as physical devices.
7. Update this doc when a reliable screenshot/diff workflow is added.

## Current iOS simulator path

Use the installed iOS 26.5 `iPhone 17 Pro` simulator when available. Build with direct `xcodebuild`, install/launch through Argent or `simctl`, then inspect with Argent `describe`/screenshots.

## Scripted core-tab baseline

The non-destructive `.argent/flows/core-tabs-visual-baseline.yaml` flow launches the mock-auth app, waits for a stable marker on each primary tab, and captures Today, Chat, Plans, and Me in order. Before execution, read its prerequisite and confirm that the recorded iOS 26.5 simulator is booted with a current `EXPO_PUBLIC_MOCK_AUTH=1` build installed. Then execute `core-tabs-visual-baseline` through Argent from the repository root with the prerequisite acknowledged.

This is an opt-in visual smoke baseline, not part of `tools/agent_validate` and not a pixel-diff assertion. Review all four returned screenshots; save durable images under `.planning/artifacts/` when a slice needs retained evidence. Re-record the flow if the canonical simulator, tab geometry, or stable screen markers change.

## Evidence checklist

- App was built from current source.
- Changed route/screen was opened.
- Today, Chat, Plans, and Me navigation still works when tab-level UI changes.
- Screenshot or accessibility/tree output was captured.
