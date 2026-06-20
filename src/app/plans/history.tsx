import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

type Category = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
const categories: Array<{ value?: Category; label: string }> = [
  { label: "All" },
  { value: "food", label: "Food" },
  { value: "drinks", label: "Drinks" },
  { value: "entertainment", label: "Entertainment" },
  { value: "activity", label: "Activity" },
  { value: "intimacy", label: "Intimacy" },
];

export default function PlanHistoryScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const [category, setCategory] = useState<Category | undefined>();
  const matches = useQuery(api.plans.matches, { category });

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || matches === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-10 gap-5">
      <View className="flex-row items-center justify-between">
        <Pressable
          className="h-11 px-4 rounded-full bg-white border border-[#e6d2c2] items-center justify-center"
          onPress={() => router.back()}
        >
          <Text className="font-bold text-[#2f211c]">Back</Text>
        </Pressable>
        <Text className="text-lg font-bold text-[#2f211c]">Match history</Text>
        <View className="w-16" />
      </View>
      <View className="flex-row flex-wrap gap-2">
        {categories.map((item) => (
          <Pressable
            key={item.label}
            className={`rounded-full px-4 py-2 ${category === item.value ? "bg-[#2f211c]" : "bg-white/80 border border-[#e6d2c2]"}`}
            onPress={() => setCategory(item.value)}
          >
            <Text className={category === item.value ? "text-white" : "text-[#6f5a50]"}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      {matches.length ? (
        matches.map((match) => (
          <View
            key={match._id}
            className="rounded-3xl bg-white/90 p-5 border border-[#f1dfd2] gap-2"
          >
            <Text className="text-sm font-bold uppercase tracking-widest text-[#8c766b]">
              {match.idea.category}
            </Text>
            <Text className="text-2xl font-bold text-[#2f211c]">{match.idea.title}</Text>
            <Text className="text-base leading-6 text-[#6f5a50]">{match.idea.description}</Text>
            <View className="flex-row flex-wrap gap-2">
              {(match.idea.subcategories ?? match.idea.vibeTags ?? []).map((tag: string) => (
                <Text
                  key={tag}
                  className="rounded-full bg-[#f4ecff] px-3 py-1 text-sm text-[#5b21b6]"
                >
                  #{tag}
                </Text>
              ))}
            </View>
          </View>
        ))
      ) : (
        <Text className="text-base text-[#6f5a50]">
          No matches yet. Go swipe something you both want.
        </Text>
      )}
    </ScrollView>
  );
}
