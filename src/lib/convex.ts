import Constants from "expo-constants";
import { ConvexReactClient } from "convex/react";

const convexUrl =
  process.env.EXPO_PUBLIC_CONVEX_URL ??
  (Constants.expoConfig?.extra?.convexUrl as string | undefined) ??
  "https://fleet-pig-957.convex.cloud";

export const convex = new ConvexReactClient(convexUrl);
