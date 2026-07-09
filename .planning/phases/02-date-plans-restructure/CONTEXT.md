# Phase 2 Context — Date Plans Restructure

Source: `docs/product-spec-date-plans-restructure.md`

## Locked language

- Plan item: one swipeable unit; can be place or activity.
- Date: bundle of one or more plan items plus optional freeform steps.
- Our Dates: couple-owned decision list for saved/scheduled/completed/rated dates.
- Dates are not swipeable; swipe remains on plan items only.

## MVP implementation scope from spec

- Add `planIdeas.kind = activity | place` while preserving existing category behavior.
- Add date templates composed of plan items and freeform steps.
- Seed starter dates from existing matched items.
- Add date likes, saves, schedules, completions, ratings.
- Add queries for recommendations, leaderboard sorting, and Our Dates.
- Update UI copy and Plans tab separation between matched plan items and dates.
