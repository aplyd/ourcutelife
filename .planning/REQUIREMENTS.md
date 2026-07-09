# Requirements

## Product principles

- REQ-PROD-001: Private until mutual — user-created plan items are not revealed as creator-authored until a mutual match.
- REQ-PROD-002: AI is invoked, not lurking — coach speaks only when explicitly asked or when a user approves a draft/action.
- REQ-PROD-003: Daily prompt answers are context/conversation starters, not moments journal entries.
- REQ-PROD-004: Use warm labels: `Me`, `Intimacy`, `hard` instead of clinical/harsh labels.
- REQ-PROD-005: MVP paths can be lightweight, but must be honest and non-crashing.

## Relationship app restructure

- REQ-APP-001: Bottom tabs are Today, Chat, Plans, Me.
- REQ-APP-002: Today tab includes Together For, Daily Prompt, weekly game/quiz cards, recent moments, Add Moment FAB.
- REQ-APP-003: Chat tab supports user messages and explicit coach invocation affordances.
- REQ-APP-004: Plans tab has category grid, add plan item, match history, random picker, and category swipe flows.
- REQ-APP-005: Non-tab routes include moments and plans detail/new/history/random/match routes.

## Date plans restructure

- REQ-DATE-001: Swipe stays on plan items only; dates are not swipeable.
- REQ-DATE-002: Plan items can be `activity` or `place`.
- REQ-DATE-003: Dates are bundles of plan items plus optional freeform steps.
- REQ-DATE-004: Mutual plan item likes feed contextual date recommendations.
- REQ-DATE-005: Our Dates tracks suggested, liked-by-one, saved, scheduled, completed, and rated dates.
