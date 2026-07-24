import { useAppMutation, useAppQuery } from "@/lib/devMock";
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
  const viewer = useAppQuery(api.auth.viewer, {});
  const ideas = useAppQuery(api.plans.list, category ? { category } : "skip");
  const seed = useAppMutation(api.plans.seed);
  const vote = useAppMutation(api.plans.vote);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (betterAuthSession.data?.session && viewer?.couple) void seed({});
  }, [betterAuthSession.data?.session, seed, viewer?.couple]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || ideas === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const currentIdea = ideas[0];
  const label = labels[category] ?? "Plans";
  const planItemLabel = `${label} plan items`;

  async function handleVote(ideaId: Id<"planIdeas">, nextVote: "like" | "pass") {
    setIsWorking(true);
    try {
      await vote({ ideaId, vote: nextVote });
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <View className="flex-1 bg-[#fff8f1] px-3 pt-14 pb-10 gap-3">
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityLabel="Back"
          accessibilityRole="button"
          className="h-11 px-4 rounded-full bg-white border border-[#e6d2c2] items-center justify-center"
          onPress={() => router.back()}
        >
          <Text className="font-bold text-[#2f211c]">Back</Text>
        </Pressable>
        <Text className="text-lg font-bold text-[#2f211c]">{planItemLabel}</Text>
        <Pressable
          accessibilityLabel="History"
          accessibilityRole="button"
          className="h-11 px-4 rounded-full bg-white border border-[#e6d2c2] items-center justify-center"
          onPress={() => router.push("/plans/history")}
        >
          <Text className="font-bold text-[#2f211c]">History</Text>
        </Pressable>
      </View>

      {currentIdea ? (
        <View className="flex-1 rounded-[40px] bg-white/95 p-4 border border-[#f1dfd2] justify-between">
          <View className="gap-4">
            <View className="flex-row flex-wrap gap-2">
              <Text className="rounded-full bg-[#f4ecff] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#5b21b6]">
                {planItemLabel}
              </Text>
              <Text className="rounded-full bg-[#ecfeff] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#0e7490]">
                {currentIdea.kind === "place" ? "Place" : "Activity"}
              </Text>
            </View>
            <Text className="text-4xl font-bold leading-[46px] text-[#2f211c]">
              {currentIdea.title}
            </Text>
            <Text className="text-lg leading-7 text-[#6f5a50]">{currentIdea.description}</Text>
            <View className="flex-row flex-wrap gap-2">
              {(currentIdea.subcategories ?? currentIdea.vibeTags ?? []).map((tag: string) => (
                <Text
                  key={tag}
                  className="rounded-full bg-[#fff8f1] px-3 py-2 text-sm font-semibold text-[#6f5a50]"
                >
                  #{tag}
                </Text>
              ))}
            </View>
          </View>
          <View className="flex-row gap-3">
            <Pressable
              accessibilityLabel="Pass"
              accessibilityRole="button"
              className="flex-1 h-16 rounded-full bg-[#f1dfd2] items-center justify-center"
              disabled={isWorking}
              onPress={() => handleVote(currentIdea._id, "pass")}
            >
              <Text className="text-lg font-bold text-[#6f5a50]">Pass</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Like"
              accessibilityRole="button"
              className="flex-1 h-16 rounded-full bg-[#7c3aed] items-center justify-center"
              disabled={isWorking}
              onPress={() => handleVote(currentIdea._id, "like")}
            >
              <Text className="text-lg font-bold text-white">Like</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-1 rounded-[40px] bg-white/95 p-4 border border-[#f1dfd2] items-center justify-center gap-3">
          <Text className="text-3xl font-bold text-center text-[#2f211c]">
            No more {label.toLowerCase()} plan item cards
          </Text>
          <Text className="text-base leading-6 text-center text-[#6f5a50]">
            Add your own private suggestion or check another category.
          </Text>
          <Pressable
            accessibilityLabel="Add a private plan item"
            accessibilityRole="button"
            className="h-12 rounded-full bg-[#7c3aed] px-5 items-center justify-center"
            onPress={() => router.push("/plans/new")}
          >
            <Text className="font-bold text-white">Add plan item</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
