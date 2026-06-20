import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import {
  ActivityIndicator,
  Alert,
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
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
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
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-28 gap-6">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">Me</Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Profile and couple settings</Text>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-4">
        <View className="items-center gap-3">
          <Pressable
            className="h-24 w-24 rounded-full bg-[#7c3aed] items-center justify-center"
            onPress={() => router.push("/me/profile")}
          >
            <Text className="text-3xl font-bold text-white">{name.slice(0, 1).toUpperCase()}</Text>
          </Pressable>
          <Text className="text-sm text-[#8c766b]">Tap avatar to update your profile</Text>
        </View>
        <View className="gap-2">
          <Pressable onPress={() => router.push("/me/profile")}>
            <Text className="text-sm font-semibold text-[#6f5a50]">Name ✎</Text>
            <TextInput
              editable={false}
              className="h-12 rounded-2xl border border-[#e6d2c2] bg-[#fff8f1] px-4 text-base text-[#2f211c]"
              value={name}
            />
          </Pressable>
        </View>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-4">
        <Text className="text-2xl font-bold text-[#2f211c]">Relationship</Text>
        <View className="gap-1">
          <Text className="text-sm font-semibold text-[#6f5a50]">Partner</Text>
          <Text className="text-lg font-bold text-[#2f211c]">{partnerName}</Text>
        </View>
        <Pressable className="gap-1" onPress={() => router.push("/me/anniversary")}>
          <Text className="text-sm font-semibold text-[#6f5a50]">Anniversary ✎</Text>
          <Text className="text-lg font-bold text-[#2f211c]">{anniversary}</Text>
        </Pressable>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-4">
        <Text className="text-2xl font-bold text-[#2f211c]">Settings</Text>
        <View className="flex-row gap-2">
          {(["light", "dark", "system"] as const).map((item) => (
            <Pressable
              key={item}
              className={`flex-1 rounded-full py-3 items-center ${theme === item ? "bg-[#2f211c]" : "bg-[#fff8f1] border border-[#e6d2c2]"}`}
              onPress={() => setTheme(item)}
            >
              <Text
                className={`font-semibold capitalize ${theme === item ? "text-white" : "text-[#6f5a50]"}`}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-3">
        <Text className="text-2xl font-bold text-[#2f211c]">Account</Text>
        <Pressable
          className="h-12 rounded-full bg-[#2f211c] items-center justify-center"
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
