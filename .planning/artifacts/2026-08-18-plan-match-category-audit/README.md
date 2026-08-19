# Plan-match category audit and repair evidence

- Date: 2026-08-18
- Device: iPhone 17 Pro / iOS 26.5
- Simulator UDID: `F736E64F-ED8F-475C-BD05-7C156B568F74`
- Bundle: `com.ourcutelife.app`
- Exact route: `ourcutelife:///plans/match/food`
- Mock auth: installed deterministic mock-auth build, refreshed from Metro at port 8084
- Interaction: launch/reload and exact deep link only; Pass, Like, History, Back, Add a private plan item, and every mutation control were not activated

## Before

The Food queue displayed the existing fixture whose category/kind is Activity. Production `convex/plans.ts` already applies the requested category through `by_couple_and_category`; the mismatch was isolated to deterministic `plans:list` mock dispatch returning the Activity fixture for every category.

- Screenshot: `food-shows-activity-fixture.png`
- Screenshot SHA-256: `77fde7ec7567f19256a2305c0bd53d8730faccab39d71c8b255234ba24314c31`

## Repair

Only deterministic mock-auth `plans:list` dispatch now filters its local fixture list by the requested category. The fixture remains Activity and production Convex/backend contracts were not modified. Focused coverage proves omitted and matching Activity arguments retain the fixture while non-matching Food returns an empty list, and asserts that `plans:list` uses that fixture filter.

- RED: focused test passed 1 and failed 1 before dispatch wiring because `plans:list` did not use `filterMockPlanIdeas`
- GREEN: focused test passed 2/2 after dispatch wiring
- Complete unit suite: 187/187 passed
- TypeScript: passed
- Targeted formatting: passed for `src/lib/devMock.ts`, `src/lib/mockPlanMatches.ts`, and `tests/unit/mock-plan-matches-fixture.test.ts`
- `git diff --check`: passed

## After

Argent opened the same exact Food route after a Metro reload and public AX showed the existing honest empty state: `No more food plan item cards`, its explanatory copy, and `Add a private plan item`. The Activity fixture, Pass, and Like were absent. No control was activated.

- Public accessibility tree: `accessibility-tree.txt`
- Screenshot: `food-empty-fixed.png`
- Screenshot SHA-256: `834de1d66cc93024e0726326cd5243e27e195847eb23827baee3a8e0759f311a`

## Debugger and safety

Argent debugger status on the active Metro port 8084 reported connected, 14 loaded scripts, and `sourceMapReady: true`. The post-reload log registry contained two normal startup/info entries and no warnings or errors. Port 8081 separately had no CDP target; no debugger claim is based on that port. No live backend/data, provider, credential, deployment, migration, notification, production Convex behavior, or mutation was touched. No commit or push occurred.
