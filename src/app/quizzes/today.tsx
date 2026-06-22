import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

const choices = ["space", "touch", "humor", "clarity", "reassurance"];

export default function TodayQuizScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const todayPrompt = useQuery(api.prompts.today, {});
  const [guess, setGuess] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

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
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="px-3 pt-16 pb-10 gap-4">
      <Pressable onPress={() => router.back()}>
        <Text className="font-semibold text-accent">← Back</Text>
      </Pressable>

      <View className="rounded-[36px] border border-soft bg-card p-5 gap-4">
        <Text className="text-sm font-semibold uppercase tracking-widest text-muted">
          Tiny quiz
        </Text>
        <Text className="text-4xl font-bold leading-[44px] text-ink">{quiz.title}</Text>
        <Text className="text-base leading-6 text-muted">{quiz.principle}</Text>
      </View>

      <View className="rounded-[36px] bg-ink p-5 gap-4">
        <Text className="text-sm font-bold uppercase tracking-widest text-white/60">
          Guess first
        </Text>
        <Text className="text-3xl font-bold leading-10 text-white">{quiz.question}</Text>
        <View className="flex-row flex-wrap gap-2">
          {choices.map((choice) => {
            const active = guess === choice;
            return (
              <Pressable
                key={choice}
                className={`rounded-full px-4 py-3 ${active ? "bg-accent" : "bg-white/15"}`}
                onPress={() => setGuess(choice)}
              >
                <Text className="font-bold text-white">{choice}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="rounded-[32px] border border-soft bg-card p-4 gap-3">
        <Text className="text-2xl font-bold text-ink">Then compare models</Text>
        <Text className="text-base leading-6 text-muted">
          Ask your partner out loud. The win is not being right. The win is updating your map of
          what they need right now.
        </Text>
        <Pressable
          className="h-12 rounded-full bg-accent items-center justify-center"
          disabled={!guess}
          onPress={() => setRevealed(true)}
        >
          <Text className="font-bold text-white">I asked them</Text>
        </Pressable>
        {revealed ? (
          <View className="rounded-3xl bg-app-bg p-4 border border-soft gap-2">
            <Text className="text-sm font-bold uppercase tracking-widest text-muted">Debrief</Text>
            <Text className="text-lg font-bold text-ink">
              You guessed “{guess}.” What did that reveal about how well you know this week’s
              version of them?
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
