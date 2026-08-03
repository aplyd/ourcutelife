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
import type * as dailyPromptDateResolver from "../dailyPromptDateResolver.js";
import type * as dailyPromptDelivery from "../dailyPromptDelivery.js";
import type * as dailyPromptDeliveryOutcome from "../dailyPromptDeliveryOutcome.js";
import type * as dailyPromptDeliveryReservation from "../dailyPromptDeliveryReservation.js";
import type * as dailyPromptDeliveryStart from "../dailyPromptDeliveryStart.js";
import type * as dailyPromptDeliveryToken from "../dailyPromptDeliveryToken.js";
import type * as dailyPromptDispatch from "../dailyPromptDispatch.js";
import type * as dailyPromptGeneration from "../dailyPromptGeneration.js";
import type * as dailyPromptGenerationActions from "../dailyPromptGenerationActions.js";
import type * as dailyPromptGenerationOrchestration from "../dailyPromptGenerationOrchestration.js";
import type * as dailyPromptGenerationPolicy from "../dailyPromptGenerationPolicy.js";
import type * as dailyPromptInventory from "../dailyPromptInventory.js";
import type * as dailyPromptInventoryReadiness from "../dailyPromptInventoryReadiness.js";
import type * as dailyPromptLibrary from "../dailyPromptLibrary.js";
import type * as dailyPromptLifecycle from "../dailyPromptLifecycle.js";
import type * as dailyPromptLifecycles from "../dailyPromptLifecycles.js";
import type * as dailyPromptSelection from "../dailyPromptSelection.js";
import type * as datePlanDedupe from "../datePlanDedupe.js";
import type * as datePlanState from "../datePlanState.js";
import type * as discovery from "../discovery.js";
import type * as health from "../health.js";
import type * as http from "../http.js";
import type * as moments from "../moments.js";
import type * as notificationDevices from "../notificationDevices.js";
import type * as pairing from "../pairing.js";
import type * as pairingAcceptedDispatch from "../pairingAcceptedDispatch.js";
import type * as pairingAcceptedNotification from "../pairingAcceptedNotification.js";
import type * as pairingAcceptedNotificationState from "../pairingAcceptedNotificationState.js";
import type * as planPrivacy from "../planPrivacy.js";
import type * as plans from "../plans.js";
import type * as prompts from "../prompts.js";
import type * as push from "../push.js";
import type * as qualityTime from "../qualityTime.js";
import type * as qualityTimePolicy from "../qualityTimePolicy.js";
import type * as reviews from "../reviews.js";
import type * as stats from "../stats.js";
import type * as testDataCleanup from "../testDataCleanup.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  chat: typeof chat;
  chatActions: typeof chatActions;
  crons: typeof crons;
  dailyPromptDateResolver: typeof dailyPromptDateResolver;
  dailyPromptDelivery: typeof dailyPromptDelivery;
  dailyPromptDeliveryOutcome: typeof dailyPromptDeliveryOutcome;
  dailyPromptDeliveryReservation: typeof dailyPromptDeliveryReservation;
  dailyPromptDeliveryStart: typeof dailyPromptDeliveryStart;
  dailyPromptDeliveryToken: typeof dailyPromptDeliveryToken;
  dailyPromptDispatch: typeof dailyPromptDispatch;
  dailyPromptGeneration: typeof dailyPromptGeneration;
  dailyPromptGenerationActions: typeof dailyPromptGenerationActions;
  dailyPromptGenerationOrchestration: typeof dailyPromptGenerationOrchestration;
  dailyPromptGenerationPolicy: typeof dailyPromptGenerationPolicy;
  dailyPromptInventory: typeof dailyPromptInventory;
  dailyPromptInventoryReadiness: typeof dailyPromptInventoryReadiness;
  dailyPromptLibrary: typeof dailyPromptLibrary;
  dailyPromptLifecycle: typeof dailyPromptLifecycle;
  dailyPromptLifecycles: typeof dailyPromptLifecycles;
  dailyPromptSelection: typeof dailyPromptSelection;
  datePlanDedupe: typeof datePlanDedupe;
  datePlanState: typeof datePlanState;
  discovery: typeof discovery;
  health: typeof health;
  http: typeof http;
  moments: typeof moments;
  notificationDevices: typeof notificationDevices;
  pairing: typeof pairing;
  pairingAcceptedDispatch: typeof pairingAcceptedDispatch;
  pairingAcceptedNotification: typeof pairingAcceptedNotification;
  pairingAcceptedNotificationState: typeof pairingAcceptedNotificationState;
  planPrivacy: typeof planPrivacy;
  plans: typeof plans;
  prompts: typeof prompts;
  push: typeof push;
  qualityTime: typeof qualityTime;
  qualityTimePolicy: typeof qualityTimePolicy;
  reviews: typeof reviews;
  stats: typeof stats;
  testDataCleanup: typeof testDataCleanup;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
