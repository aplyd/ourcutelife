# Our Cute Life

iOS-only Expo couples app scaffolded with the HeroUI Native Expo tabs starter.

## Stack

- Expo SDK 56 + Expo Router
- HeroUI Native + Uniwind
- Convex backend (`https://usable-tapir-102.convex.cloud`)
- Apple Authentication wired for Convex auth handoff
- Expo Updates / Notifications / Splash Screen / Vision Camera plugins configured
- `pnpm`, `oxfmt`, `oxlint --type-aware --type-check`, TypeScript

## Commands

```bash
pnpm install
pnpm ios
pnpm format:check
pnpm lint
pnpm typecheck
pnpm convex:deploy
```

## Required CI secrets

Set these in GitHub Actions before expecting deploy workflows to pass:

- `EXPO_TOKEN`
- `CONVEX_DEPLOY_KEY`

Apple Sign In via Convex also requires Apple client configuration / JWT verification values in Convex environment variables once the Apple developer identifiers are finalized.
