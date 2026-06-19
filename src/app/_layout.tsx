import type { JSX } from "react";
import { useEffect } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { ConvexProvider } from "convex/react";
import { HeroUINativeProvider } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AuthSessionProvider } from "@/lib/authSession";
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
      <ConvexProvider client={convex}>
        <AuthSessionProvider>
          <HeroUINativeProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth" />
              <Stack.Screen name="pairing" />
              <Stack.Screen name="(tabs)" />
            </Stack>
            <StatusBar style="auto" />
          </HeroUINativeProvider>
        </AuthSessionProvider>
      </ConvexProvider>
    </GestureHandlerRootView>
  );
}
