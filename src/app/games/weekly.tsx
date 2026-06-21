import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function WeeklyGameScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const todayPrompt = useQuery(api.prompts.today, {});

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || todayPrompt === undefined)
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const game = todayPrompt.weeklyGame;

  return (
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="px-3 pt-16 pb-10 gap-3">
      <Pressable onPress={() => router.back()}>
        <Text className="font-semibold text-accent">← Back</Text>
      </Pressable>
      <Text className="text-sm font-semibold uppercase tracking-widest text-muted">
        Weekly game
      </Text>
      <Text className="text-4xl font-bold text-ink">{game.title}</Text>
      <View className="rounded-3xl border border-soft bg-card/90 p-4 gap-3">
        <Text className="text-base leading-6 text-muted">{game.description}</Text>
        <Text className="text-sm font-semibold uppercase tracking-widest text-muted">
          Why this works
        </Text>
        <Text className="text-lg font-bold text-ink">{game.principle}</Text>
      </View>
      <View className="rounded-3xl border border-soft bg-card/90 p-4 gap-3">
        <Text className="text-2xl font-bold text-ink">How to play</Text>
        <Text className="text-base leading-7 text-muted">
          1. Read the game out loud together.{"\n"}
          2. Each person says what would make it feel easy, not performative.{"\n"}
          3. Try it once this week. Tiny counts.{"\n"}
          4. Come back and talk about what landed.
        </Text>
      </View>
    </ScrollView>
  );
}
