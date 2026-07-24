# Phase 5 Slice 05-03 — Permission, Device, and Timezone Reconciliation

Completed: 2026-07-22 17:08 PDT

## Outcome

Implemented the authenticated, non-prompting notification-device reconciliation boundary and canonical couple prompt-timezone policy. This slice does not plan or dispatch daily notifications.

## Files

- `convex/notificationDevices.ts`
  - Authenticated permission observation and granted-device registration.
  - Stable device identity, token rotation/ownership checks, inferred revocation, coarse readiness, and explicit IANA timezone updates.
  - Exactly-one-membership checks fail closed; readiness requires exactly two couple members with active granted tokenized devices.
  - Initial `couples.promptTimezone` comes only from the creator's latest valid ready device after both members are ready.
- `convex/notificationDevices.test.ts`
  - 17 focused backend tests covering auth, idempotent observations, token registration/rotation/collision, revocation, readiness, creator timezone policy, privacy, invalid membership cardinality, and explicit timezone updates.
- `convex/push.ts`
  - Hardened the retained legacy token-registration path against cross-user token transfer while preserving its existing reminder behavior.
- `src/lib/notifications.ts`
  - Separated non-prompting permission observation from explicit permission request.
  - Added persisted installation/device ID, platform/timezone observation, and granted-only Expo token retrieval.
- `src/app/_layout.tsx`
  - Reconciles notification observation after authenticated startup and foreground return without requesting permission; registration follows only when a granted token is available.
- `tests/unit/notification-registration.test.ts`
  - Source-contract coverage proving observation/request separation and observation-first registration order.

The additive schema and Convex/Vitest dependencies used here were established in Slice 05-02; no live migration or deployment occurred.

## RED → GREEN evidence

The delegated implementation recorded the initial vertical test cycles and converted review findings into regression tests. Coordinator reproduction after the interrupted remediation showed:

- RED: `convex/notificationDevices.test.ts` — 4 failures / 17 tests.
  - Cross-device token movement left two rows carrying one token.
  - Revocation retained a stale token.
  - Null auth identity threw before the intended fail-closed error.
  - Duplicate-membership fixture used obsolete schema fields.
- RED: `pnpm typecheck` — null-identity and invalid test-fixture errors.
- Fixes were limited to clearing stale optional token fields, null-safe identity lookup, exact-one membership lookup, and a schema-valid duplicate-membership fixture.
- Independent review then identified two Medium issues and both were converted into tests before correction:
  - RED: a valid creator device beyond twenty stale rows was ignored, leaving readiness blocked and the creator timezone unset.
  - RED: a source contract found the retained legacy registration path falling back to non-canonical `identity.subject`.
- Fixes removed the arbitrary 20-device caps from correctness-critical readiness/timezone reads and restricted legacy auth lookup to `identity.tokenIdentifier`.
- GREEN: focused backend suite — 19/19 passed.
- GREEN: full typecheck passed.

## Final verification

- `pnpm test:unit`: 69/69 passed.
- `pnpm test:convex`: 25/25 passed across two files.
- `pnpm typecheck`: passed.
- `pnpm lint`: 0 warnings and 0 errors across 98 files.
- Targeted `oxfmt --check`: passed for 9 files.
- `git diff --check`: passed.
- `tools/agent_review`: no obvious added-line security patterns.

## Argent evidence

Device: iPhone 17 Pro, iOS 26.5 simulator, bundle `com.ourcutelife.app`.

- App launched successfully into the authenticated Today screen.
- Public accessibility inspection found the normal Today content and primary navigation.
- After Home/background and relaunch/foreground, Today became visible again without any notification permission prompt.
- Debugger connected to this repository with 12 loaded scripts and a ready source map.
- Debugger log registry contained 0 entries.
- No fetch traffic was captured in the mock session.

This is non-production lifecycle evidence only. Mock auth does not prove live Convex writes, APNs/Expo token issuance, OS permission transitions on a physical device, or real notification delivery.

## Privacy and security

- Public mutations derive user and couple identity from authentication and membership; callers cannot submit user IDs or couple IDs.
- Token collision cannot silently transfer a token between users.
- Revocation and same-user cross-device movement clear stale routing tokens.
- Readiness returns only member counts, readiness, coarse blocked reason, and couple timezone—never partner tokens or device details.
- Duplicate memberships fail closed.

## Remaining boundary

Slice 05-03 does not create daily lifecycle rows, choose or persist first recipients, schedule 7–9 PM delivery, dispatch Expo pushes, or record answer-start events. Those remain in Slices 05-04 through 05-07.

Next bounded slice: **05-04 — transactional couple-day lifecycle planning with immutable timezone/date/random-minute/recipient snapshots and create-or-return idempotency.**
