import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

type Category = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
const categories: Array<{ value: Category; label: string }> = [
  { value: "food", label: "Food" },
  { value: "drinks", label: "Drinks" },
  { value: "entertainment", label: "Entertainment" },
  { value: "activity", label: "Activity" },
  { value: "intimacy", label: "Intimacy" },
];

export default function RandomPlansScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const [selected, setSelected] = useState<Category[]>(["food", "activity"]);
  const picks = useQuery(api.plans.randomByCategories, { categories: selected });

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || picks === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  function toggle(category: Category) {
    setSelected((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-10 gap-5">
      <View className="flex-row items-center justify-between">
        <Pressable
          className="h-11 px-4 rounded-full bg-white border border-[#e6d2c2] items-center justify-center"
          onPress={() => router.back()}
        >
          <Text className="font-bold text-[#2f211c]">Back</Text>
        </Pressable>
        <Text className="text-lg font-bold text-[#2f211c]">Surprise us</Text>
        <View className="w-16" />
      </View>
      <Text className="text-4xl font-bold text-[#2f211c]">Roll the dice</Text>
      <View className="flex-row flex-wrap gap-2">
        {categories.map((item) => {
          const active = selected.includes(item.value);
          return (
            <Pressable
              key={item.value}
              className={`rounded-full px-4 py-2 ${active ? "bg-[#2f211c]" : "bg-white/80 border border-[#e6d2c2]"}`}
              onPress={() => toggle(item.value)}
            >
              <Text className={active ? "text-white" : "text-[#6f5a50]"}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {picks.map((pick) => (
        <View key={pick._id} className="rounded-3xl bg-white/90 p-5 border border-[#f1dfd2] gap-2">
          <Text className="text-sm font-bold uppercase tracking-widest text-[#8c766b]">
            {pick.category}
          </Text>
          <Text className="text-2xl font-bold text-[#2f211c]">{pick.title}</Text>
          <Text className="text-base leading-6 text-[#6f5a50]">{pick.description}</Text>
        </View>
      ))}
      {!picks.length ? (
        <Text className="text-base text-[#6f5a50]">No picks in those categories yet.</Text>
      ) : null}
    </ScrollView>
  );
}
