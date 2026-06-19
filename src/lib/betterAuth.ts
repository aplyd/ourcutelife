import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";

const convexSiteUrl =
  process.env.EXPO_PUBLIC_CONVEX_SITE_URL ??
  process.env.EXPO_PUBLIC_CONVEX_HTTP_ACTIONS_URL ??
  (Constants.expoConfig?.extra?.convexHttpActionsUrl as string | undefined) ??
  "https://usable-tapir-102.convex.site";

export const authClient = createAuthClient({
  baseURL: `${convexSiteUrl}/api/auth`,
  plugins: [
    expoClient({
      scheme: "ourcutelife",
      storagePrefix: "ourcutelife",
      storage: SecureStore,
      // The Better Auth Expo plugin can try to cache an undefined
      // /get-session response. Native storage bridges reject undefined values
      // (surfacing as MMKV/SecureStore variant conversion errors), while the
      // cookie store is enough for Convex Better Auth session persistence.
      disableCache: true,
    }),
    convexClient(),
  ],
});

export const { useSession } = authClient;
