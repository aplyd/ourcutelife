import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

const categories = [
  { value: "food", label: "Food", icon: "🍝" },
  { value: "drinks", label: "Drinks", icon: "🍸" },
  { value: "entertainment", label: "Entertainment", icon: "🎭" },
  { value: "activity", label: "Activity", icon: "🚲" },
  { value: "intimacy", label: "Intimacy", icon: "🕯️" },
] as const;

export default function PlansTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) return <View className="flex-1 bg-[#fff8f1] items-center justify-center"><ActivityIndicator /></View>;
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  return (
    <View className="flex-1 bg-[#fff8f1]">
      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-16 pb-32 gap-6">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1 gap-2">
            <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">Plans</Text>
            <Text className="text-4xl font-bold text-[#2f211c]">Find what you both want</Text>
            <Text className="text-base leading-6 text-[#6f5a50]">Suggestions stay private until both of you swipe yes.</Text>
          </View>
          <View className="flex-row gap-2 pt-1">
            <Pressable className="h-11 w-11 rounded-full bg-white border border-[#e6d2c2] items-center justify-center" onPress={() => router.push("/plans/random")}>
              <Text className="text-xl">🎲</Text>
            </Pressable>
            <Pressable className="h-11 w-11 rounded-full bg-white border border-[#e6d2c2] items-center justify-center" onPress={() => router.push("/plans/history")}>
              <Text className="text-xl">🕘</Text>
            </Pressable>
          </View>
        </View>

        <View className="flex-row flex-wrap gap-3">
          {categories.map((category) => (
            <Pressable key={category.value} className="w-[48%] aspect-square rounded-[32px] bg-white/90 border border-[#f1dfd2] p-5 justify-between" onPress={() => router.push(`/plans/match/${category.value}`)}>
              <Text className="text-4xl">{category.icon}</Text>
              <View className="gap-1">
                <Text className="text-2xl font-bold text-[#2f211c]">{category.label}</Text>
                <Text className="text-sm leading-5 text-[#6f5a50]">Swipe privately. Matches reveal later.</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Pressable className="absolute bottom-8 right-6 h-16 w-16 rounded-full bg-[#7c3aed] items-center justify-center shadow-lg" onPress={() => router.push("/plans/new")}>
        <Text className="text-4xl leading-none text-white">＋</Text>
      </Pressable>
    </View>
  );
}
