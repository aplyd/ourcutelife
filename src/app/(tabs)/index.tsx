import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import AnimatedRollingNumber from "react-native-animated-rolling-numbers";

import { api } from "../../../convex/_generated/api";
import { MeHeaderButton } from "@/components/MeHeaderButton";
import { useSession } from "@/lib/betterAuth";

type DurationParts = {
  years: number;
  months: number;
  weeks: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

const toneStyles = {
  good: "bg-emerald-100 text-emerald-900",
  mixed: "bg-amber-100 text-amber-900",
  bad: "bg-rose-100 text-rose-900",
} as const;

function getDurationParts(start: number | undefined, tick: number): DurationParts {
  void tick;
  if (!start) return { years: 0, months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const years = Math.floor(totalSeconds / 31_536_000);
  const months = Math.floor((totalSeconds % 31_536_000) / 2_592_000);
  const weeks = Math.floor((totalSeconds % 2_592_000) / 604_800);
  const days = Math.floor((totalSeconds % 604_800) / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return { years, months, weeks, days, hours, minutes, seconds };
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(timestamp),
  );
}

export default function TodayTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const todayPrompt = useQuery(api.prompts.today, {});
  const moments = useQuery(api.moments.listMine, {});
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setNowTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const duration = useMemo(
    () => getDurationParts(viewer?.couple?.anniversaryDate, nowTick),
    [viewer?.couple?.anniversaryDate, nowTick],
  );

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || todayPrompt === undefined || moments === undefined) {
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple) return <Redirect href="/pairing" />;

  const partnerName = "your person";
  const promptData = todayPrompt;
  const hasAnswered = Boolean(promptData.response);
  const recentMoments = moments.slice(0, 5);

  let promptStatus = "Answer today's prompt together.";
  if (promptData.partnerHasAnswered && !hasAnswered)
    promptStatus = `${partnerName} answered. Submit yours to see.`;
  else if (hasAnswered && !promptData.isRevealed) promptStatus = `Waiting for ${partnerName}.`;
  else if (promptData.isRevealed)
    promptStatus = "You both answered. Use it as a conversation starter.";

  return (
    <View className="flex-1 bg-app-bg">
      <MeHeaderButton />
      <ScrollView className="flex-1" contentContainerClassName="px-3 pt-16 pb-40 gap-3">
        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-widest text-muted">Today</Text>
          <Text className="text-4xl font-bold text-ink">Your cute little daily reset</Text>
          <Text className="text-base leading-6 text-muted">
            Check in, answer the tiny prompt, and keep the good/hard stuff from disappearing.
          </Text>
        </View>

        <View className="rounded-3xl bg-card/90 p-4 border border-soft gap-4">
          <View className="flex-row items-center gap-3">
            <View className="flex-row w-16">
              <View className="h-11 w-11 rounded-full bg-accent border-2 border-white items-center justify-center">
                <Text className="font-bold text-white">You</Text>
              </View>
              <View className="h-11 w-11 -ml-5 rounded-full bg-[#f97316] border-2 border-white items-center justify-center">
                <Text className="font-bold text-white">♥</Text>
              </View>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold uppercase tracking-widest text-muted">
                Together for
              </Text>
              <Text className="text-base text-muted">
                You and {partnerName} have been together for…
              </Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {Object.entries(duration).map(([label, value]) => (
              <View
                key={label}
                className="min-w-[86px] rounded-2xl bg-app-bg p-3 border border-soft"
              >
                <AnimatedRollingNumber
                  value={value}
                  textStyle={{ fontSize: 28, fontWeight: "800", color: "#2f211c" }}
                />
                <Text className="text-xs font-semibold uppercase text-muted">{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-3xl bg-ink p-4 gap-4">
          <Text className="text-sm font-semibold uppercase tracking-widest text-[#d8c2b4]">
            Daily prompt
          </Text>
          <Text className="text-2xl font-bold leading-8 text-app-bg">{promptData.prompt}</Text>
          <Text className="text-base leading-6 text-[#d8c2b4]">{promptStatus}</Text>

          {hasAnswered ? (
            <View className="gap-3">
              <View className="rounded-2xl bg-white/10 p-3 gap-2">
                <Text className="text-xs font-semibold uppercase tracking-widest text-[#d8c2b4]">
                  Your answer
                </Text>
                <Text className="text-base leading-6 text-app-bg">{promptData.response}</Text>
              </View>
              {promptData.isRevealed && promptData.partnerResponse ? (
                <View className="rounded-2xl bg-white/10 p-3 gap-2">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-[#d8c2b4]">
                    Partner answer
                  </Text>
                  <Text className="text-base leading-6 text-app-bg">
                    {promptData.partnerResponse.response}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Pressable
            className="h-11 rounded-full bg-app-bg items-center justify-center"
            onPress={() => router.push("/prompts/today")}
          >
            <Text className="font-semibold text-ink">
              {hasAnswered ? "Edit answer" : "Answer prompt"}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row gap-3">
          <Pressable
            className="flex-1 aspect-square rounded-[28px] bg-card/90 border border-soft p-4 justify-between"
            onPress={() => router.push("/games/weekly")}
          >
            <Text className="text-4xl">🎮</Text>
            <View>
              <Text className="text-lg font-bold text-ink">{promptData.weeklyGame.title}</Text>
              <Text className="text-sm text-muted" numberOfLines={4}>
                {promptData.weeklyGame.description}
              </Text>
            </View>
          </Pressable>
          <Pressable
            className="flex-1 aspect-square rounded-[28px] bg-card/90 border border-soft p-4 justify-between"
            onPress={() => router.push("/quizzes/today")}
          >
            <Text className="text-4xl">💬</Text>
            <View>
              <Text className="text-lg font-bold text-ink">{promptData.quiz.title}</Text>
              <Text className="text-sm text-muted" numberOfLines={4}>
                {promptData.quiz.question}
              </Text>
            </View>
          </Pressable>
        </View>

        <View className="rounded-3xl bg-card/90 p-4 border border-soft gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-ink">Recent moments</Text>
            <Pressable onPress={() => router.push("/moments")}>
              <Text className="font-semibold text-[#7c3aed]">See all</Text>
            </Pressable>
          </View>
          {recentMoments.length ? (
            <View className="gap-2">
              {recentMoments.map((moment) => (
                <Pressable
                  key={moment._id}
                  className="flex-row items-center gap-3 py-2"
                  onPress={() => router.push(`/moments/${moment._id}`)}
                >
                  <Text
                    className={`overflow-hidden rounded-full px-2 py-1 text-xs font-bold ${toneStyles[moment.tone]}`}
                  >
                    {moment.tone === "bad" ? "HARD" : moment.tone.toUpperCase()}
                  </Text>
                  <Text className="w-14 text-xs text-muted">{formatDate(moment.happenedAt)}</Text>
                  <Text className="flex-1 text-base font-semibold text-ink" numberOfLines={1}>
                    {moment.summary}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-base text-muted">
              No moments yet. Add one when something feels worth remembering.
            </Text>
          )}
        </View>
      </ScrollView>

      <Pressable
        className="absolute bottom-28 right-3 h-16 w-16 rounded-full bg-accent items-center justify-center shadow-lg"
        onPress={() => router.push("/moments/new")}
      >
        <Text className="text-4xl leading-none text-white">＋</Text>
      </Pressable>
    </View>
  );
}
