import AsyncStorage from "@react-native-async-storage/async-storage";
import type { JSX, ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { Uniwind } from "uniwind";

type ThemePreference = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
};

const storageKey = "ourcutelife.themePreference";
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");

  useEffect(() => {
    void AsyncStorage.getItem(storageKey).then((value) => {
      if (value === "light" || value === "dark" || value === "system") setPreferenceState(value);
    });
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? (systemScheme === "dark" ? "dark" : "light") : preference;

  useEffect(() => {
    Uniwind.setTheme(preference);
  }, [preference]);

  const value = useMemo(
    () => ({
      preference,
      resolvedTheme,
      setPreference: (next: ThemePreference) => {
        setPreferenceState(next);
        void AsyncStorage.setItem(storageKey, next);
      },
    }),
    [preference, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useAppTheme must be used inside ThemeProvider.");
  return value;
}
