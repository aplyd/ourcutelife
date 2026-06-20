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
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
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
    <View className="flex-1 bg-[#fff8f1]">
      <MeHeaderButton />
      <ScrollView className="flex-1" contentContainerClassName="px-6 pt-16 pb-40 gap-6">
        <View className="gap-2">
          <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
            Today
          </Text>
          <Text className="text-4xl font-bold text-[#2f211c]">Your cute little daily reset</Text>
          <Text className="text-base leading-6 text-[#6f5a50]">
            Check in, answer the tiny prompt, and keep the good/hard stuff from disappearing.
          </Text>
        </View>

        <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-4">
          <View className="flex-row items-center gap-3">
            <View className="flex-row w-16">
              <View className="h-11 w-11 rounded-full bg-[#7c3aed] border-2 border-white items-center justify-center">
                <Text className="font-bold text-white">You</Text>
              </View>
              <View className="h-11 w-11 -ml-5 rounded-full bg-[#f97316] border-2 border-white items-center justify-center">
                <Text className="font-bold text-white">♥</Text>
              </View>
            </View>
            <View className="flex-1">
              <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
                Together for
              </Text>
              <Text className="text-base text-[#6f5a50]">
                You and {partnerName} have been together for…
              </Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {Object.entries(duration).map(([label, value]) => (
              <View
                key={label}
                className="min-w-[86px] rounded-2xl bg-[#fff8f1] p-3 border border-[#f1dfd2]"
              >
                <AnimatedRollingNumber
                  value={value}
                  textStyle={{ fontSize: 28, fontWeight: "800", color: "#2f211c" }}
                />
                <Text className="text-xs font-semibold uppercase text-[#8c766b]">{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="rounded-3xl bg-[#2f211c] p-5 gap-4">
          <Text className="text-sm font-semibold uppercase tracking-widest text-[#d8c2b4]">
            Daily prompt
          </Text>
          <Text className="text-2xl font-bold leading-8 text-[#fff8f1]">{promptData.prompt}</Text>
          <Text className="text-base leading-6 text-[#d8c2b4]">{promptStatus}</Text>

          {hasAnswered ? (
            <View className="gap-3">
              <View className="rounded-2xl bg-white/10 p-3 gap-2">
                <Text className="text-xs font-semibold uppercase tracking-widest text-[#d8c2b4]">
                  Your answer
                </Text>
                <Text className="text-base leading-6 text-[#fff8f1]">{promptData.response}</Text>
              </View>
              {promptData.isRevealed && promptData.partnerResponse ? (
                <View className="rounded-2xl bg-white/10 p-3 gap-2">
                  <Text className="text-xs font-semibold uppercase tracking-widest text-[#d8c2b4]">
                    Partner answer
                  </Text>
                  <Text className="text-base leading-6 text-[#fff8f1]">
                    {promptData.partnerResponse.response}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Pressable
            className="h-11 rounded-full bg-[#fff8f1] items-center justify-center"
            onPress={() => router.push("/prompts/today")}
          >
            <Text className="font-semibold text-[#2f211c]">
              {hasAnswered ? "Edit answer" : "Answer prompt"}
            </Text>
          </Pressable>
        </View>

        <View className="flex-row gap-3">
          <View className="flex-1 aspect-square rounded-[28px] bg-white/85 border border-[#f1dfd2] p-4 justify-between">
            <Text className="text-4xl">🎮</Text>
            <View>
              <Text className="text-lg font-bold text-[#2f211c]">Weekly game</Text>
              <Text className="text-sm text-[#6f5a50]">Tiny couple challenge coming soon.</Text>
            </View>
          </View>
          <View className="flex-1 aspect-square rounded-[28px] bg-white/85 border border-[#f1dfd2] p-4 justify-between">
            <Text className="text-4xl">💬</Text>
            <View>
              <Text className="text-lg font-bold text-[#2f211c]">Quiz</Text>
              <Text className="text-sm text-[#6f5a50]">Conversation sparks, not homework.</Text>
            </View>
          </View>
        </View>

        <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold text-[#2f211c]">Recent moments</Text>
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
                  <Text className="w-14 text-xs text-[#8c766b]">
                    {formatDate(moment.happenedAt)}
                  </Text>
                  <Text className="flex-1 text-base font-semibold text-[#2f211c]" numberOfLines={1}>
                    {moment.summary}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text className="text-base text-[#6f5a50]">
              No moments yet. Add one when something feels worth remembering.
            </Text>
          )}
        </View>
      </ScrollView>

      <Pressable
        className="absolute bottom-28 right-6 h-16 w-16 rounded-full bg-[#7c3aed] items-center justify-center shadow-lg"
        onPress={() => router.push("/moments/new")}
      >
        <Text className="text-4xl leading-none text-white">＋</Text>
      </Pressable>
    </View>
  );
}
