import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

const prompts = [
  "Make a tiny bid for attention.",
  "Name one specific appreciation.",
  "Ask one curious follow-up.",
  "Offer one repair phrase you’d actually use.",
  "Pick a tiny ritual to protect this week.",
];

export default function WeeklyGameScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const todayPrompt = useQuery(api.prompts.today, {});
  const [checked, setChecked] = useState<number[]>([]);
  const [turn, setTurn] = useState(0);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || todayPrompt === undefined)
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const game = todayPrompt.weeklyGame;
  const cards = [game.description, ...prompts].map((text, index) => ({ index, text }));
  const progress = Math.round((checked.length / cards.length) * 100);

  function toggle(index: number) {
    setChecked((current) =>
      current.includes(index) ? current.filter((item) => item !== index) : [...current, index],
    );
  }

  return (
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="px-3 pt-16 pb-10 gap-4">
      <Pressable onPress={() => router.back()}>
        <Text className="font-semibold text-accent">← Back</Text>
      </Pressable>

      <View className="rounded-[36px] bg-ink p-5 gap-4 overflow-hidden">
        <Text className="text-sm font-semibold uppercase tracking-widest text-white/60">
          Weekly game
        </Text>
        <Text className="text-4xl font-bold leading-[44px] text-white">{game.title}</Text>
        <Text className="text-base leading-6 text-white/75">{game.principle}</Text>
        <View className="h-3 overflow-hidden rounded-full bg-white/15">
          <View className="h-3 rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </View>
      </View>

      <View className="rounded-[32px] border border-soft bg-card p-4 gap-3">
        <Text className="text-sm font-bold uppercase tracking-widest text-muted">Turn card</Text>
        <Text className="text-3xl font-bold leading-10 text-ink">{cards[turn].text}</Text>
        <View className="flex-row gap-2">
          <Pressable
            className="flex-1 rounded-full bg-app-bg border border-soft py-3 items-center"
            onPress={() => setTurn((value) => (value + cards.length - 1) % cards.length)}
          >
            <Text className="font-bold text-ink">Previous</Text>
          </Pressable>
          <Pressable
            className="flex-1 rounded-full bg-accent py-3 items-center"
            onPress={() => setTurn((value) => (value + 1) % cards.length)}
          >
            <Text className="font-bold text-white">Next prompt</Text>
          </Pressable>
        </View>
      </View>

      <View className="gap-2">
        <Text className="text-2xl font-bold text-ink">Scoreboard</Text>
        {cards.map((card) => {
          const done = checked.includes(card.index);
          return (
            <Pressable
              key={card.index}
              className={`rounded-3xl border p-4 ${done ? "border-accent bg-accent/10" : "border-soft bg-card"}`}
              onPress={() => toggle(card.index)}
            >
              <Text className="text-base font-bold text-ink">
                {done ? "✓" : "○"} {card.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
