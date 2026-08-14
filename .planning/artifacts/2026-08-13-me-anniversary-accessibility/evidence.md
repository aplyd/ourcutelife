# Me anniversary accessibility evidence

- Route: exact deterministic mock-auth `ourcutelife:///me`
- Device: iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`)
- Route evidence: Argent `launch-app` returned `{"launched":true,"bundleId":"com.ourcutelife.app"}` and `open-url` returned `{"opened":true,"url":"ourcutelife:///me"}`.
- Public accessibility result: one `AXButton "Edit anniversary, February 14, 2022"` appears after `Test Partner` and before Settings. There is no duplicate standalone `February 14, 2022` node.
- Adjacent `Edit name, Agent User`, theme actions, and four native tab buttons remained intact.
- The visible anniversary date and layout remained unchanged in `me.png`.
- No edit control, other control, gesture, or data mutation was activated.
- Screenshot: `me.png`
- Screenshot SHA-256: `8efff8299e3b6519487fdb8f353640b64fa24953efbb34c9c2d3bc0694e448f1`
- Accessibility tree: `accessibility-tree.json`
- Focused RED: 0/1 passed; assertion failed with `expected the anniversary edit action with its displayed date` before the product change.
- Focused GREEN: 1/1 passed.
- Full unit gate: 177/177 passed.
- TypeScript: `pnpm typecheck` passed.
- Targeted formatting: `oxfmt --check` passed for the Me route and focused test after targeted formatting.
- Whitespace: `git diff --check` passed.
- Debugger: see `debugger-evidence.md`; Metro had no CDP target, so no source-map or clean debugger-log claim is made.
