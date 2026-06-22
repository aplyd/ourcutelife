import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import * as Updates from "expo-updates";

const minimumCheckIntervalMs = 30_000;

function updatesAreEnabled(): boolean {
  return !__DEV__ && Updates.isEnabled;
}

export function UpdateProvider({ children }: { children: ReactNode }) {
  const appState = useRef(AppState.currentState);
  const isChecking = useRef(false);
  const lastCheckedAt = useRef(0);

  const checkForOTAUpdates = useCallback(async () => {
    if (!updatesAreEnabled() || isChecking.current) return;

    const now = Date.now();
    if (now - lastCheckedAt.current < minimumCheckIntervalMs) return;

    isChecking.current = true;
    lastCheckedAt.current = now;

    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) return;

      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    } catch {
      // OTA checks are opportunistic; failures should not interrupt app launch/resume.
    } finally {
      isChecking.current = false;
    }
  }, []);

  useEffect(() => {
    void checkForOTAUpdates();
  }, [checkForOTAUpdates]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (/inactive|background/.exec(appState.current) && nextAppState === "active") {
        void checkForOTAUpdates();
      }

      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [checkForOTAUpdates]);

  return children;
}
