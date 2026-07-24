# Decisions

- D-001: Use `.planning/` as canonical agent state for Our Cute Life.
- D-002: Existing product specs in `docs/` are accepted input requirements, not hidden state.
- D-003: For mobile/React Native/Expo/UI work, agents should use Argent for simulator/device inspection and verification when available.
- D-004: Before changing Convex code, agents must read `convex/_generated/ai/guidelines.md`.
- D-005: Before committing or pushing code changes, run `pnpm format:fix` so CI does not fail on formatting drift.
- D-006: Private-until-mutual and invoked-AI principles are product constraints, not optional polish.
- D-007: Replace the forward-looking Plans/Dates/Matches product model with a couple-initiated `Quality Time` workflow; preserve current implementation until bounded replacement phases are planned and verified.
- D-008: Daily prompt notification leadership alternates between partners, with the first notification randomized between 7–9 PM and the second triggered five minutes after the first partner begins answering.
- D-009: Daily prompts use a privacy-safe reusable library ranked by successful couple completions, with Vercel AI SDK generation supplying fresh prompts under Gottman-inspired but non-affiliated guidance.
- D-010: Apple Notes is an intake and concise mirror only. `.planning/` remains canonical, and each project should have one current Apple Note rather than separate project and roadmap notes.

## Autonomy policy

Agents may autonomously:

- inspect app code, docs, generated Convex guidelines, and planning files
- update `.planning/` files
- draft phase plans and implementation slices
- implement low-risk, clearly planned UI/code/test changes in a branch/worktree
- run pnpm checks and Argent simulator verification

Agents must ask before:

- changing product direction beyond accepted specs
- deploying Convex/Expo production changes
- modifying secrets or Apple developer configuration
- changing private-until-mutual behavior in a way that exposes user-created items early
