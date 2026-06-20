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
import { ThemeProvider, useAppTheme } from "@/lib/theme";
import "@/lib/notifications";
import "../global.css";

void SplashScreen.preventAutoHideAsync();

function RootStack(): JSX.Element {
  const { resolvedTheme } = useAppTheme();

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="pairing" />
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
      </Stack>
      <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
    </>
  );
}

export default function RootLayout(): JSX.Element {
  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ConvexBetterAuthProvider client={convex} authClient={authClient as never}>
        <HeroUINativeProvider>
          <ThemeProvider>
            <RootStack />
          </ThemeProvider>
        </HeroUINativeProvider>
      </ConvexBetterAuthProvider>
    </GestureHandlerRootView>
  );
}
