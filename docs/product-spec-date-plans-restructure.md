# Date plans restructure

## Locked product language

- **Plan item**: one swipeable unit. It can be a **place** (`Gunther's Ice Cream`, `Sacramento Midtown Farmers Market`) or an **activity** (`have a picnic`, `make sandwiches`, `puzzle night at home`).
- **Date**: any ordered or unordered bundle of one or more plan items, plus optional freeform steps. A date can be tiny (`have a picnic`) or full (`farmers market → make sandwiches → hike Muir Trail → picnic under Muir waterfall`).
- **Our Dates**: the couple-owned decision list: saved, scheduled, completed, and rated dates.

Avoid making dates swipeable. Swipe stays on plan items only.

## Core loop

1. Each partner swipes privately on plan items.
2. Mutual likes become matched plan items.
3. The app recommends dates that include matched items.
4. Either partner can like a date.
5. When both partners like it, or one partner saves it, the date enters **Our Dates**.
6. The couple can schedule, complete, and rate dates.
7. Ratings and completed history improve future recommendations.

## Surfaces

### Swipe

- Shows plan items only.
- Plan items display whether they are an activity or place.
- Partner-created items stay private until matched.

### Matched items

- Shows history of mutual matches only.
- Each matched item can reveal contextual date recommendations: “People usually pair this with…”

### Explore Dates

Leaderboard for the area/couple dataset.

Sort modes:

- **Suggested**: highest overlap with the couple’s matched plan items.
- **Popular**: most saves/completions.
- **Rating**: best average rating.
- **Trending**: recent likes/saves/completions.

### Our Dates

Decision screen for date night.

States:

- suggested
- liked by one
- saved
- scheduled
- completed
- rated

Filters later:

- tonight / weekend
- low effort / active / cozy / fancy
- free / cheap / splurge
- nearby / at home
- saved / scheduled / completed

## MVP implementation scope

Implemented as a thin verified slice:

- Add `planIdeas.kind = activity | place` while preserving existing category behavior.
- Add date templates composed of plan items and freeform steps.
- Seed starter dates from existing matched items.
- Add date likes, saves, schedules, completions, and ratings.
- Add queries for contextual recommendations, leaderboard sorting, and Our Dates.
- Update UI copy and Plans tab to separate matched plan items from dates.

## Non-goals for this slice

- Public/social publishing.
- Real global area leaderboard across all couples.
- Editable/remixable date builder.
- Heavy review text or Yelp-style reviews.
- Push notifications/nudges.
