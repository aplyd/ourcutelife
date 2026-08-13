# Moments history grouping audit — 2026-08-13

- Scope: exactly `/moments`, the accepted filterable/grouped moment-history screen.
- Device: deterministic mock-auth `com.ourcutelife.app`, iPhone 17 Pro / iOS 26.5 (`F736E64F-ED8F-475C-BD05-7C156B568F74`).
- Route command: `argent run open-url --udid F736E64F-ED8F-475C-BD05-7C156B568F74 --url 'ourcutelife:///moments' --json` returned `opened: true`.
- Reproduced mismatch: filters are present, but the history is a flat card list. The route screenshot and public AX tree expose the filter controls followed directly by the mock moment card, with no date/period group heading or grouped section. Source confirms one `filteredMoments.map(...)` inside a single `View` (`src/app/(tabs)/moments.tsx:111-150`) and no grouping operation or section header. This does not satisfy the accepted `/moments` **filterable/grouped** history contract (`docs/product-spec-relationship-app-restructure.md:39`).
- Screenshot: `moments.png`, 362×787, SHA-256 `a577e6f03eb23601e153c56d2b725c8076e0f6ba1b6ff413e02a075880445cac`.
- Debugger limitation: Metro port 8081 had no CDP target; native devtools were not connected and required restart. No clean debugger/native claim is made.

## Exact future Argent verification

1. Launch/reinstall the deterministic mock-auth build on the same iPhone simulator, then open exact `ourcutelife:///moments`.
2. Ensure the deterministic fixture contains moments in at least two intended date buckets (without any live service); if necessary, extend only the mock fixture in the later implementation slice.
3. `argent run describe --udid F736E64F-ED8F-475C-BD05-7C156B568F74 --bundleId com.ourcutelife.app --json` must expose a stable named heading for every visible date/period group, with each moment following its correct heading in traversal order.
4. Tap `Show hard moments`; require native selected state when inspectable, only hard cards remaining, and the applicable group headings retained with empty groups omitted.
5. Retain a screenshot showing at least two visible group headings and cards. Verify each card still opens its moment detail, then navigate back non-destructively.
6. Run `debugger-status` and `debugger-log-registry` against the connected Metro port/device; require ready source maps and no new warnings/errors before claiming a clean runtime. Retry app-scoped native inspection only if injection reports connected.
