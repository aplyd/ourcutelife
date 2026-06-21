import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function TodayQuizScreen(): JSX.Element {
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

  const quiz = todayPrompt.quiz;

  return (
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="px-3 pt-16 pb-10 gap-3">
      <Pressable onPress={() => router.back()}>
        <Text className="font-semibold text-accent">← Back</Text>
      </Pressable>
      <Text className="text-sm font-semibold uppercase tracking-widest text-muted">Tiny quiz</Text>
      <Text className="text-4xl font-bold text-ink">{quiz.title}</Text>
      <View className="rounded-3xl border border-soft bg-card/90 p-4 gap-3">
        <Text className="text-sm font-semibold uppercase tracking-widest text-muted">Question</Text>
        <Text className="text-2xl font-bold leading-8 text-ink">{quiz.question}</Text>
        <Text className="text-sm font-semibold uppercase tracking-widest text-muted">
          Principle
        </Text>
        <Text className="text-lg font-bold text-ink">{quiz.principle}</Text>
      </View>
      <View className="rounded-3xl border border-soft bg-card/90 p-4 gap-3">
        <Text className="text-2xl font-bold text-ink">Use it</Text>
        <Text className="text-base leading-7 text-muted">
          Guess your partner’s answer first. Then ask them. The point isn’t being right — it’s
          finding the places where your model of each other is stale.
        </Text>
      </View>
    </ScrollView>
  );
}
