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
    }),
    convexClient(),
  ],
});

export const { useSession } = authClient;
