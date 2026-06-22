import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../../../convex/_generated/api";
import { authClient, useSession } from "@/lib/betterAuth";
import { useAppTheme } from "@/lib/theme";

export default function MeTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const { preference: theme, setPreference: setTheme } = useAppTheme();

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined)
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const name = viewer.user.fullName ?? viewer.user.email ?? "You";
  const partnerName = viewer.partner?.fullName ?? viewer.partner?.email ?? "Your partner";
  const anniversary = viewer.couple.anniversaryDate
    ? new Intl.DateTimeFormat("en", { month: "long", day: "numeric", year: "numeric" }).format(
        new Date(viewer.couple.anniversaryDate),
      )
    : "Not set yet";

  function confirmLeaveCouple() {
    Alert.alert(
      "Leave couple?",
      "This is intentionally not wired yet. Leaving a couple needs a safe data-retention decision first.",
      [{ text: "OK" }],
    );
  }

  return (
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="px-3 pt-16 pb-28 gap-3">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-muted">Me</Text>
        <Text className="text-4xl font-bold text-ink">Profile and couple settings</Text>
      </View>

      <View className="rounded-3xl bg-card/90 p-4 border border-soft gap-4">
        <View className="items-center gap-3">
          <Pressable
            className="h-24 w-24 overflow-hidden rounded-full bg-accent items-center justify-center"
            onPress={() => router.push("/me/profile")}
          >
            {viewer.user.avatarUrl ? (
              <Image source={{ uri: viewer.user.avatarUrl }} className="h-24 w-24" />
            ) : (
              <Text className="text-3xl font-bold text-white">
                {name.slice(0, 1).toUpperCase()}
              </Text>
            )}
          </Pressable>
          <Text className="text-sm text-muted">Tap avatar to update your profile</Text>
        </View>
        <View className="gap-2">
          <Pressable onPress={() => router.push("/me/profile")}>
            <Text className="text-sm font-semibold text-muted">Name ✎</Text>
            <TextInput
              editable={false}
              className="h-12 rounded-2xl border border-soft bg-app-bg px-4 text-base text-ink"
              value={name}
            />
          </Pressable>
        </View>
      </View>

      <View className="rounded-3xl bg-card/90 p-4 border border-soft gap-4">
        <Text className="text-2xl font-bold text-ink">Relationship</Text>
        <View className="gap-1">
          <Text className="text-sm font-semibold text-muted">Partner</Text>
          <Text className="text-lg font-bold text-ink">{partnerName}</Text>
        </View>
        <Pressable className="gap-1" onPress={() => router.push("/me/anniversary")}>
          <Text className="text-sm font-semibold text-muted">Anniversary ✎</Text>
          <Text className="text-lg font-bold text-ink">{anniversary}</Text>
        </Pressable>
      </View>

      <View className="rounded-3xl bg-card/90 p-4 border border-soft gap-4">
        <Text className="text-2xl font-bold text-ink">Settings</Text>
        <View className="flex-row gap-2">
          {(["light", "dark", "system"] as const).map((item) => (
            <Pressable
              key={item}
              className={`flex-1 rounded-full py-3 items-center ${theme === item ? "bg-ink" : "bg-app-bg border border-soft"}`}
              onPress={() => setTheme(item)}
            >
              <Text
                className={`font-semibold capitalize ${theme === item ? "text-white" : "text-muted"}`}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="rounded-3xl bg-card/90 p-4 border border-soft gap-3">
        <Text className="text-2xl font-bold text-ink">Account</Text>
        <Pressable
          className="h-12 rounded-full bg-ink items-center justify-center"
          onPress={() => void authClient.signOut()}
        >
          <Text className="font-bold text-white">Sign out</Text>
        </Pressable>
        <Pressable
          className="h-12 rounded-full border border-[#fecdd3] bg-[#fff1f2] items-center justify-center"
          onPress={confirmLeaveCouple}
        >
          <Text className="font-bold text-[#be123c]">Leave couple</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
