import type { JSX } from "react";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { authClient } from "@/lib/betterAuth";
import { convex } from "@/lib/convex";
import "@/lib/notifications";
import "../global.css";

void SplashScreen.preventAutoHideAsync();

export default function RootLayout(): JSX.Element {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexBetterAuthProvider client={convex} authClient={authClient as never}>
        <HeroUINativeProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="auth" />
            <Stack.Screen name="pairing" />
            <Stack.Screen name="(tabs)" />
          </Stack>
          <StatusBar style="auto" />
        </HeroUINativeProvider>
      </ConvexBetterAuthProvider>
    </GestureHandlerRootView>
  );
}
