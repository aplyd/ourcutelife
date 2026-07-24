# Route and interaction evidence

- App: mock-auth `com.ourcutelife.app`
- Device: iPhone 17 Pro, iOS 26.5
- UDID: `F736E64F-ED8F-475C-BD05-7C156B568F74`
- Argent: v0.13.0 (available update was not applied)
- Entry route: `/me`, confirmed by selected Me tab and public `ME` / `Profile and couple settings` markers.
- Activated app control: only public `AXButton "Edit anniversary"` at normalized tap point `(0.5, 0.7585)`.
- Result route: `/me/anniversary`, confirmed by the sheet title `Edit anniversary`, component-tree sheet, and source route opened by the existing `/me` handler.
- Untouched field proof: public and native captures both report accessible name `Anniversary date` and existing fixture value `2022-02-14`, corresponding to the `/me` display `February 14, 2022`.
- Save proof: public capture reports `AXButton "Save anniversary"`; native capture reports label `Save anniversary`, view `RCTViewComponentView`, traits `["button"]`.
- Safety: the field was not focused or edited; Save was not tapped; saving/busy state was not triggered; no backend mutation ran.
- Debugger: connected to the current repository bundle; final registry `totalEntries: 0`, with zero warnings and zero errors.
