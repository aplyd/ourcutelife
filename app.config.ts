import type { ExpoConfig } from "expo/config";

const convexUrl = process.env.EXPO_PUBLIC_CONVEX_URL ?? "https://fleet-pig-957.convex.cloud";
const convexHttpActionsUrl =
  process.env.EXPO_PUBLIC_CONVEX_HTTP_ACTIONS_URL ?? "https://fleet-pig-957.convex.site";

const config: ExpoConfig = {
  name: "ourcutelife",
  slug: "ourcutelife",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "ourcutelife",
  userInterfaceStyle: "automatic",
  owner: "aftacnik",
  platforms: ["ios"],
  runtimeVersion: { policy: "appVersion" },
  updates: {
    url: "https://u.expo.dev/bc593a73-f488-4b02-a0cf-89f4cb272d35",
    fallbackToCacheTimeout: 0,
  },
  ios: {
    bundleIdentifier: "com.ourcutelife.app",
    supportsTablet: false,
    associatedDomains: ["applinks:ourcutelife.com", "applinks:ourcute.life"],
    usesAppleSignIn: true,
    infoPlist: {
      NSCameraUsageDescription:
        "Our Cute Life uses the camera so you can add photos and videos to shared memories and journal entries.",
      NSMicrophoneUsageDescription:
        "Our Cute Life may use the microphone when recording relationship memories.",
      NSPhotoLibraryUsageDescription:
        "Our Cute Life uses your photo library so you can attach memories to your relationship timeline.",
      NSPhotoLibraryAddUsageDescription:
        "Our Cute Life can save generated or edited memories back to your photo library.",
      ITSAppUsesNonExemptEncryption: false,
    },
    entitlements: {
      "aps-environment": process.env.APP_ENV === "production" ? "production" : "development",
      "com.apple.developer.associated-domains": [
        "applinks:ourcutelife.com",
        "applinks:ourcute.life",
      ],
    },
  },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-apple-authentication",
    "expo-notifications",
    "expo-updates",
    [
      "app-icon-badge",
      {
        enabled: process.env.APP_ENV !== "production",
        badges: [
          {
            text: "DEV",
            type: "banner",
            position: "top",
            background: "#7c3aed",
            color: "white",
          },
        ],
      },
    ],
    [
      "expo-image-picker",
      { photosPermission: "Our Cute Life uses your photos for shared memories." },
    ],
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        resizeMode: "contain",
        backgroundColor: "#fff8f1",
      },
    ],
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
  extra: {
    eas: { projectId: "bc593a73-f488-4b02-a0cf-89f4cb272d35" },
    convexUrl,
    convexHttpActionsUrl,
  },
};

export default config;
