# Requirements

## Product principles

- REQ-PROD-001: Private until mutual — user-created plan items are not revealed as creator-authored until a mutual match.
- REQ-PROD-002: AI is invoked, not lurking — coach speaks only when explicitly asked or when a user approves a draft/action.
- REQ-PROD-003: Daily prompt answers are context/conversation starters, not moments journal entries.
- REQ-PROD-004: Use warm labels: `Me`, `Intimacy`, `hard` instead of clinical/harsh labels.
- REQ-PROD-005: MVP paths can be lightweight, but must be honest and non-crashing.
- REQ-PROD-006: Use `Quality Time` instead of `date` for the couple-initiated planning experience.
- REQ-PROD-007: The Quality Time flow should reduce decision fatigue by collecting private preferences before revealing only mutual options.

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

This section records the existing implementation. Its forward product direction is superseded by the Quality Time requirements below; preserve working behavior until replacement slices are planned and verified.

## Daily prompt lifecycle

- REQ-PROMPT-001: Couple prompt notifications begin only after both partners have accepted notification permission.
- REQ-PROMPT-002: Alternate the first notification between the two partners rather than always prompting the same person first.
- REQ-PROMPT-003: Send the first partner's notification at a randomized time between 7:00 PM and 9:00 PM in the couple's applicable local-time policy.
- REQ-PROMPT-004: Do not notify the second partner on the initial schedule; notify them five minutes after the first partner starts answering.
- REQ-PROMPT-005: Define and persist an idempotent lifecycle so retries, duplicate events, timezone changes, and permission changes do not send duplicate or out-of-order notifications.

## Generated and reusable prompts

- REQ-PROMPT-006: Generate a unique daily couple prompt from the cloud function using the Vercel AI SDK.
- REQ-PROMPT-007: Generation guidance may take inspiration from Gottman relationship principles but must not claim affiliation, reproduce proprietary text, diagnose users, or present therapy as medical care.
- REQ-PROMPT-008: When both partners answer a prompt, persist it in an answered-prompt library with the completion event.
- REQ-PROMPT-009: Seed new couples from the answered-prompt library before relying exclusively on newly generated prompts.
- REQ-PROMPT-010: Each additional couple completion of a reusable prompt increases its ranking so proven prompts appear earlier for other couples.
- REQ-PROMPT-011: Prompt selection must retain variety and avoid exposing either couple's answers or identity to another couple.

## Quality Time

- REQ-QT-001: One partner initiates Quality Time by choosing a date/time, including `now`, and one or more categories.
- REQ-QT-002: Initial categories are Eat, Drink, Explore/Adventure, Entertainment, and Romance.
- REQ-QT-003: The initiator privately swipes activity cards until they have accepted 3–5 options in every selected category.
- REQ-QT-004: Notify the partner only after the initiator has completed the required shortlist.
- REQ-QT-005: The responding partner chooses which of the requested categories they are currently interested in.
- REQ-QT-006: The responding partner swipes only within mutually relevant categories until at least one mutual match exists in each chosen category.
- REQ-QT-007: Reveal shared matches, not rejected/private preferences, with a clear outcome such as `You both want to eat at C and see a movie`.
- REQ-QT-008: Handle exhaustion, abandonment, changed availability, insufficient inventory, and no-match states without pressuring either partner or revealing private rejections.
