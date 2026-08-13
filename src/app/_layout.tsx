import { isDevMockAuthEnabled, useAppMutation, useAppQuery } from "@/lib/devMock";
import type { JSX } from "react";
import { useEffect } from "react";
import type { FunctionReference } from "convex/server";
import type { ErrorBoundaryProps } from "expo-router";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { HeroUINativeProvider } from "heroui-native";
import { AppState, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { api } from "../../convex/_generated/api";
import { authClient, useSession } from "@/lib/betterAuth";
import { convex } from "@/lib/convex";
import { getErrorSupportCode } from "@/lib/errorSupportCode";
import { resolveMembershipAccess } from "@/lib/membershipAccess";
import { ThemeProvider, useAppTheme } from "@/lib/theme";
import { UpdateProvider } from "@/providers/update-provider";
import "../global.css";

void SplashScreen.preventAutoHideAsync();

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps): JSX.Element {
  const supportCode = getErrorSupportCode(error);
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-app-bg px-8">
      <Text className="text-center text-3xl font-bold text-ink">We hit a snag</Text>
      <Text className="text-center text-base leading-6 text-muted">
        {__DEV__ ? error.message : "Your data is safe. Try loading this screen again."}
      </Text>
      {supportCode ? (
        <Text selectable className="text-center text-xs text-muted">
          Support code: {supportCode}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        className="rounded-2xl bg-accent px-6 py-4"
        onPress={retry}
      >
        <Text className="text-base font-bold text-white">Try again</Text>
      </Pressable>
    </View>
  );
}

type ReportPermissionObservationArgs = {
  deviceId: string;
  platform: "ios" | "android" | "web" | "unknown";
  permissionStatus: "undetermined" | "denied" | "granted";
  timezone: string;
};

type RegisterGrantedDeviceArgs = {
  deviceId: string;
  platform: "ios" | "android" | "web" | "unknown";
  pushToken: string;
  timezone: string;
};

const notificationDevicesApi = api as typeof api & {
  notificationDevices: {
    reportPermissionObservation: FunctionReference<
      "mutation",
      "public",
      ReportPermissionObservationArgs
    >;
    registerGrantedDevice: FunctionReference<"mutation", "public", RegisterGrantedDeviceArgs>;
  };
};

function RootStack(): JSX.Element {
  const { resolvedTheme } = useAppTheme();
  const betterAuthSession = useSession();
  const viewer = useAppQuery(
    api.auth.viewer,
    betterAuthSession.data?.session && !betterAuthSession.isPending ? {} : "skip",
  );
  const membershipAccess = resolveMembershipAccess({
    sessionPending: betterAuthSession.isPending,
    hasSession: Boolean(betterAuthSession.data?.session),
    viewer,
  });
  const reportPermissionObservation = useAppMutation(
    notificationDevicesApi.notificationDevices.reportPermissionObservation,
  );
  const registerGrantedDevice = useAppMutation(
    notificationDevicesApi.notificationDevices.registerGrantedDevice,
  );
  const cleanupMyLegacyGlobalAvatar = useAppMutation(api.auth.cleanupMyLegacyGlobalAvatar);

  useEffect(() => {
    if (!betterAuthSession.isPending) void SplashScreen.hideAsync();
  }, [betterAuthSession.isPending]);

  useEffect(() => {
    if (!betterAuthSession.data?.session) return;
    void cleanupMyLegacyGlobalAvatar().catch(() => {
      // Legacy media cleanup is retried on the next authenticated app launch.
    });
  }, [betterAuthSession.data?.session, cleanupMyLegacyGlobalAvatar]);

  useEffect(() => {
    if (isDevMockAuthEnabled || !betterAuthSession.data?.session) return;

    let cancelled = false;
    const reconcile = () => {
      void import("@/lib/notifications")
        .then(({ reconcileServerPushRegistration }) => reconcileServerPushRegistration())
        .then(async (result) => {
          if (cancelled) return;
          await reportPermissionObservation(result.observation);
          if (result.registration) {
            if (cancelled) return;
            await registerGrantedDevice(result.registration);
          }
        })
        .catch(() => {
          // Push permission observation is opportunistic; don't block app launch.
        });
    };

    reconcile();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") reconcile();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [
    betterAuthSession.data?.session,
    viewer?.membership?.coupleId,
    registerGrantedDevice,
    reportPermissionObservation,
  ]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={membershipAccess === "loading"}>
          <Stack.Screen name="index" />
        </Stack.Protected>
        <Stack.Protected guard={membershipAccess === "signed-out"}>
          <Stack.Screen name="auth" />
        </Stack.Protected>
        <Stack.Protected guard={membershipAccess === "pairing"}>
          <Stack.Screen name="pairing" />
        </Stack.Protected>
        <Stack.Protected guard={membershipAccess === "paired"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="(sheet)"
            options={{
              contentStyle: {
                backgroundColor: "transparent",
              },
              presentation: "formSheet",
              headerShown: false,
              gestureDirection: "vertical",
              gestureResponseDistance: {
                top: 50,
                bottom: 50,
              },
              animation: "slide_from_bottom",
              sheetGrabberVisible: false,
              sheetInitialDetentIndex: 1,
              sheetAllowedDetents: [0.3, 0.8],
              sheetExpandsWhenScrolledToEdge: true,
              sheetCornerRadius: 48,
            }}
          />
          <Stack.Screen name="account" />
          <Stack.Screen name="moments" />
          <Stack.Screen name="plans/history" />
          <Stack.Screen name="plans/match/[category]" />
          <Stack.Screen name="plans/quality-time/new" />
          <Stack.Screen name="plans/quality-time/[requestId]" />
          <Stack.Screen name="plans/quality-time/[requestId]/respond" />
          <Stack.Screen name="plans/quality-time/[requestId]/outcome" />
          <Stack.Screen name="games/weekly" />
          <Stack.Screen name="quizzes/today" />
        </Stack.Protected>
      </Stack>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout(): JSX.Element {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexBetterAuthProvider client={convex} authClient={authClient as never}>
        <HeroUINativeProvider>
          <ThemeProvider>
            <UpdateProvider>
              <RootStack />
            </UpdateProvider>
          </ThemeProvider>
        </HeroUINativeProvider>
      </ConvexBetterAuthProvider>
    </GestureHandlerRootView>
  );
}
