# Me anniversary card audit evidence

- Route: exact mock-auth `ourcutelife:///me`
- Device: iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`)
- Finding: the visible anniversary value `February 14, 2022` is nested inside the explicitly labeled edit control, but public accessibility exposes only `AXButton "Edit anniversary"`; the current date is absent.
- Adjacent controls remained intact: `Edit name, Agent User`, all three theme actions, and the four native tab buttons.
- No control or mutation was activated.
- Screenshot: `me.png`
- Screenshot SHA-256: `ccebe5156b7984cebfa79769f11e17b8a15f4e9c366cae59eb9fcfd5066ec7ae`
- Accessibility tree: `accessibility-tree.json`
- Debugger limitation: Metro port 8081 had no CDP target, so no source-map or clean debugger-log claim is made.
