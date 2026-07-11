# Visual Verification

Summary:

1. Use visual/runtime verification whenever UI changed.
2. Mobile work should use Argent simulator/device verification when available.
3. Capture route names, screenshots, accessibility descriptions, and walkthrough steps.
4. Store durable evidence in `.planning/worksheets/` or phase summaries, not only chat.
5. Visual regressions should eventually become scripted baselines.
6. Use direct `xcodebuild` + Argent reinstall when Expo CLI misclassifies simulator UDIDs as physical devices.
7. Update this doc when a reliable screenshot/diff workflow is added.

## Current iOS simulator path

Use the installed iOS 26.5 `iPhone 17 Pro` simulator when available. Build with direct `xcodebuild`, install/launch through Argent or `simctl`, then inspect with Argent `describe`/screenshots.

## Evidence checklist

- App was built from current source.
- Changed route/screen was opened.
- Today, Chat, Plans, and Me navigation still works when tab-level UI changes.
- Screenshot or accessibility/tree output was captured.
