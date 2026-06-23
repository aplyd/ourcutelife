/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as chatActions from "../chatActions.js";
import type * as crons from "../crons.js";
import type * as discovery from "../discovery.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as moments from "../moments.js";
import type * as pairing from "../pairing.js";
import type * as plans from "../plans.js";
import type * as prompts from "../prompts.js";
import type * as push from "../push.js";
import type * as reviews from "../reviews.js";
import type * as stats from "../stats.js";

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chat: typeof chat;
  chatActions: typeof chatActions;
  crons: typeof crons;
  discovery: typeof discovery;
  health: typeof health;
  http: typeof http;
  moments: typeof moments;
  pairing: typeof pairing;
  plans: typeof plans;
  prompts: typeof prompts;
  push: typeof push;
  reviews: typeof reviews;
  stats: typeof stats;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
