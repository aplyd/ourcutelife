# Our Cute Life Product Spec — App Restructure

**Date:** 2026-06-20
**Status:** Accepted for implementation

## Product spine

Our Cute Life helps a couple turn small daily reflections into connection, private desire-matching, plans, and shared memory without making either partner feel exposed before there is mutual buy-in.

The app is organized around four jobs:

| Tab   | Job                                                 |
| ----- | --------------------------------------------------- |
| Today | Daily ritual, relationship snapshot, recent moments |
| Chat  | Couple + invoked AI coach conversation space        |
| Plans | Private plan/desire matching and match history      |
| Me    | Profile, relationship settings, account controls    |

## Global UX principles

1. **Private until mutual.** Plan items created by one user are not revealed as user-created until they become a mutual match.
2. **AI is invoked, not lurking.** The coach should only speak when explicitly asked or when a user approves an AI draft/action.
3. **Prompts are context, not moments.** Daily prompt answers stay as lightweight conversation starters and AI context; they are not saved into the moments journal.
4. **Warm labels over clinical labels.** Use `Me` for account/profile and `Intimacy` for the intimate plan category.
5. **MVP paths can be lightweight, but not fake.** Empty routes should be honest placeholders only when the backend/UX is not implemented yet.

## Navigation

Bottom tabs:

```txt
Today | Chat | Plans | Me
```

Non-tab routes:

- `/moments/new` — add moment formsheet/modal
- `/moments/[id]` — moment detail
- `/moments` — filterable/grouped moment history list
- `/plans/match/[category]` — full-screen swipe flow for one category
- `/plans/history` — match history list
- `/plans/new` — add plan item formsheet/modal
- `/plans/random` — random plan category picker formsheet/modal

## Today tab

### Layout

1. Header
2. Subheader
3. Together For card
4. Daily Prompt card
5. Weekly Game + Quiz bento cards
6. Recent Moments previews
7. Add Moment FAB

### Together For

- Show two overlapping avatar circles.
- Copy: `You and {partnerName} have been together for...`
- Use animated rolling numbers.
- Prefer segmented values over one long sentence:
  - years
  - months
  - weeks
  - days
  - hours
  - minutes
  - seconds

### Daily Prompt

Prompt answers are **not moments**. They are brief conversation starters and couple context for AI.

States:

| State                        | UI                                                      |
| ---------------------------- | ------------------------------------------------------- |
| neither answered             | `Answer today's prompt together.` + answer button       |
| partner answered, viewer not | `{name} answered. Submit yours to see.` + answer button |
| viewer answered, partner not | `Waiting for {name}.` + viewer answer                   |
| both answered                | show viewer answer and partner answer                   |

The answer button opens a liquid glass Expo Router formsheet/modal. If formsheet presentation is unavailable in the current environment, use a modal route with equivalent behavior.

### Weekly Game + Quiz

- Two side-by-side rounded square bento cards.
- Icons:
  - joystick for weekly game
  - speech bubble for quiz
- Can ship as lightweight/coming-soon cards initially if backend behavior is not ready.

### Recent Moments

- Show a single-line list of up to 5 most recent moments.
- Badge labels: `good`, `mixed`, `hard`.
- Current backend stores negative tone as `bad`; UI should label it as `hard`.
- Each row navigates to moment detail.
- `See all` navigates to moment history list.

## Chat tab

Full-screen 3-way chat between:

- viewer
- partner
- invoked relationship coach AI

MVP:

- Show chat thread.
- Allow sending normal user messages.
- Include explicit coach invocation affordances:
  - Ask coach
  - Rephrase before sending
  - Help us talk about this

Deferred:

- automatic monthly review shares
- partner-hidden AI monthly review drafts
- proactive plan-match nudges
- full AI response generation if model credentials/tooling are not wired

## Plans tab

### Root screen

Layout:

- Header with dice/surprise action and match history action.
- 2-column rounded-square category grid.
- FAB: Add plan item.

Categories:

| Internal      | UI label      |
| ------------- | ------------- |
| food          | Food          |
| drinks        | Drinks        |
| entertainment | Entertainment |
| activity      | Activity      |
| intimacy      | Intimacy      |

### User-created plan item privacy

User-created plan items are private until matched:

- creator can see/swipe their own pending item only if useful for editing/review, but it should not be disclosed to partner as creator-authored
- partner can see the item in their swipe queue without knowing who created it
- after both users like it, match detail can reveal `Suggested by {name}`

MVP schema should track `createdByUserId` but queries must not expose that field to the partner before match.

### Dice/random action

- Opens modal/formsheet.
- Allows category toggles.
- Submission returns one random plan item from each selected category.
- If not implemented fully yet, route should explain it is coming soon and not crash.

### Add plan item

Fields:

- title
- description
- category
- subcategories/hashtags

Default visibility: private until matched.

## Plan-match screen

Non-tab full-screen route.

Layout:

- back button top-left
- match history button top-right
- Tinder-style card stack/swipe controls
- category badge
- subcategory hashtags
- pass/like actions

MVP can use buttons for pass/like before gesture polish, but should preserve the screen model.

## Match history

List matches sorted newest first.

Filters:

- category
- subcategory/hashtag

MVP can start with category filter only.

## Me tab

Sections:

1. Profile
   - pressable avatar
   - name with edit pencil
2. Relationship
   - partner info
   - anniversary date with edit pencil
3. Settings
   - light/dark/system theme toggle
4. Account / safety
   - sign out
   - leave couple button

Avatar behavior:

- own avatar update can be direct
- partner avatar change is a suggestion requiring partner approval later

Leave couple:

- destructive/socially sensitive
- must require confirmation
- do not silently delete couple history in MVP

## Implementation phases

### Phase 1 — Navigation + Today

- Replace tabs with Today, Chat, Plans, Me.
- Move sign out from Today to Me.
- Build Today sections and recent moments.
- Add moment FAB overlay.
- Add `/moments` history route if tab route is removed.

### Phase 2 — Plans

- Update plan categories to Food, Drinks, Entertainment, Activity, Intimacy.
- Add `createdByUserId` and `subcategories`/hashtags support.
- Keep user-created items private until match.
- Build category grid, match screen, history screen, add item modal, random modal placeholder/MVP.

### Phase 3 — Chat

- Add Chat tab.
- Build 3-way chat UI with user/partner/coach sender labels.
- Add send mutation if needed.
- Coach actions are explicit placeholders until AI generation is wired.

### Phase 4 — Me

- Add Me tab.
- Display profile/couple info.
- Move sign out here.
- Add theme control UI.
- Add leave couple confirmation placeholder or safe mutation if implemented.

## Acceptance checks

- App typechecks.
- Expo public config resolves.
- Native tabs route without missing screens.
- Today scrolls and no longer contains sign out.
- Daily prompt answers remain separate from moments.
- Plans root shows 5 categories including Intimacy.
- Plan items created by users are not revealed as user-created until matched.
- Chat coach is invoked-only.
- Me screen has sign out and profile/settings sections.
