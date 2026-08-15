# Moment detail Back control — Argent evidence

Captured 2026-08-15 on deterministic mock-auth iPhone 17 Pro, iOS 26.5, simulator `F736E64F-ED8F-475C-BD05-7C156B568F74`.

1. Argent opened exact `ourcutelife:///moments/mock_moment_1`.
2. `detail-accessibility-tree.json` exposes exactly one native `AXButton "Back to moments"` while retaining `PRIVATE MOMENT`, the complete mock summary and feeling, both tags, and named `Edit moment` / `Delete moment` buttons.
3. Argent activated only the center of the new Back control (`x=0.221`, `y=0.098`).
4. `history-accessibility-tree.json` then exposes `MOMENTS`, `Your private relationship journal`, `Log a moment`, all four filters, and the unchanged `Open moment: Mocked a sweet product moment so agents can verify the timeline.` card. This confirms arrival at Moments history and that the deterministic moment was not edited or deleted.

An initial runtime probe showed that `router.back()` is not deterministic for an exact deep link: it returned to the route that happened to precede the deep link (`/quizzes/today`), not Moments history. The implementation therefore uses `router.replace("/moments")`, and the retained final evidence is from that corrected behavior.

Argent debugger connect/status/log-registry calls against Metro port 8081 all reported `Metro at port 8081 has no CDP targets — is a React Native app connected?`. Therefore no source-map readiness or clean debugger-log claim is made.
