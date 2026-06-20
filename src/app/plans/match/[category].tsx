import { useMutation, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useSession } from "@/lib/betterAuth";

type Category = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
const labels: Record<Category, string> = {
  food: "Food",
  drinks: "Drinks",
  entertainment: "Entertainment",
  activity: "Activity",
  intimacy: "Intimacy",
};

export default function PlanMatchScreen(): JSX.Element {
  const { category } = useLocalSearchParams<{ category: Category }>();
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const ideas = useQuery(api.plans.list, category ? { category } : "skip");
  const seed = useMutation(api.plans.seed);
  const vote = useMutation(api.plans.vote);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (betterAuthSession.data?.session && viewer?.couple) void seed({});
  }, [betterAuthSession.data?.session, seed, viewer?.couple]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || ideas === undefined) return <View className="flex-1 bg-[#fff8f1] items-center justify-center"><ActivityIndicator /></View>;
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const currentIdea = ideas[0];
  const label = labels[category] ?? "Plans";

  async function handleVote(ideaId: Id<"planIdeas">, nextVote: "like" | "pass") {
    setIsWorking(true);
    try {
      await vote({ ideaId, vote: nextVote });
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <View className="flex-1 bg-[#fff8f1] px-6 pt-14 pb-10 gap-6">
      <View className="flex-row items-center justify-between">
        <Pressable className="h-11 px-4 rounded-full bg-white border border-[#e6d2c2] items-center justify-center" onPress={() => router.back()}>
          <Text className="font-bold text-[#2f211c]">Back</Text>
        </Pressable>
        <Text className="text-lg font-bold text-[#2f211c]">{label}</Text>
        <Pressable className="h-11 px-4 rounded-full bg-white border border-[#e6d2c2] items-center justify-center" onPress={() => router.push("/plans/history")}>
          <Text className="font-bold text-[#2f211c]">History</Text>
        </Pressable>
      </View>

      {currentIdea ? (
        <View className="flex-1 rounded-[40px] bg-white/95 p-7 border border-[#f1dfd2] justify-between">
          <View className="gap-5">
            <Text className="self-start rounded-full bg-[#f4ecff] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#5b21b6]">{label}</Text>
            <Text className="text-4xl font-bold leading-[46px] text-[#2f211c]">{currentIdea.title}</Text>
            <Text className="text-lg leading-7 text-[#6f5a50]">{currentIdea.description}</Text>
            <View className="flex-row flex-wrap gap-2">
              {(currentIdea.subcategories ?? currentIdea.vibeTags ?? []).map((tag: string) => (
                <Text key={tag} className="rounded-full bg-[#fff8f1] px-3 py-2 text-sm font-semibold text-[#6f5a50]">#{tag}</Text>
              ))}
            </View>
          </View>
          <View className="flex-row gap-3">
            <Pressable className="flex-1 h-16 rounded-full bg-[#f1dfd2] items-center justify-center" disabled={isWorking} onPress={() => handleVote(currentIdea._id, "pass")}>
              <Text className="text-lg font-bold text-[#6f5a50]">Pass</Text>
            </Pressable>
            <Pressable className="flex-1 h-16 rounded-full bg-[#7c3aed] items-center justify-center" disabled={isWorking} onPress={() => handleVote(currentIdea._id, "like")}>
              <Text className="text-lg font-bold text-white">Like</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-1 rounded-[40px] bg-white/95 p-7 border border-[#f1dfd2] items-center justify-center gap-3">
          <Text className="text-3xl font-bold text-center text-[#2f211c]">No more {label.toLowerCase()} cards</Text>
          <Text className="text-base leading-6 text-center text-[#6f5a50]">Add your own private suggestion or check another category.</Text>
          <Pressable className="h-12 rounded-full bg-[#7c3aed] px-5 items-center justify-center" onPress={() => router.push("/plans/new")}>
            <Text className="font-bold text-white">Add plan item</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
