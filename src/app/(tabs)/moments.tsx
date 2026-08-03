import { useAppQuery } from "@/lib/devMock";
import { router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";

const toneStyles = {
  good: "bg-emerald-100 text-emerald-900",
  mixed: "bg-amber-100 text-amber-900",
  bad: "bg-rose-100 text-rose-900",
} as const;

const toneLabels = {
  good: "GOOD",
  mixed: "MIXED",
  bad: "HARD",
} as const;

const momentFilters = [
  ["all", "All"],
  ["good", "Good"],
  ["mixed", "Mixed"],
  ["bad", "Hard"],
] as const;

type MomentFilter = (typeof momentFilters)[number][0];

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default function MomentsTab(): JSX.Element {
  const moments = useAppQuery(api.moments.listMine, {});
  const [momentFilter, setMomentFilter] = useState<MomentFilter>("all");
  const filteredMoments = moments?.filter(
    (moment) => momentFilter === "all" || moment.tone === momentFilter,
  );

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-3 pt-16 pb-28 gap-4">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Moments
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Your private relationship journal</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Raw notes stay private. Later, AI will turn selected themes into relationship-safe weekly
          briefs and monthly review conversations.
        </Text>
      </View>

      <Pressable
        accessibilityLabel="Log a moment"
        accessibilityRole="button"
        className="h-14 rounded-full bg-[#7c3aed] items-center justify-center"
        onPress={() => router.push("/moments/new")}
      >
        <Text className="font-semibold text-white">Log a moment</Text>
      </Pressable>

      <View className="flex-row flex-wrap gap-2">
        {momentFilters.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityLabel={`Show ${label.toLowerCase()} moments`}
            accessibilityRole="button"
            accessibilityState={{ selected: momentFilter === value }}
            className={`rounded-full border px-4 py-2 ${
              momentFilter === value
                ? "border-[#7c3aed] bg-[#7c3aed]"
                : "border-[#f1dfd2] bg-white/85"
            }`}
            onPress={() => setMomentFilter(value)}
          >
            <Text
              className={`font-semibold ${momentFilter === value ? "text-white" : "text-[#6f5a50]"}`}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      {moments === undefined ? (
        <View className="py-10 items-center">
          <ActivityIndicator />
        </View>
      ) : moments.length === 0 ? (
        <View className="rounded-3xl bg-white/80 p-4 border border-[#f1dfd2] gap-2">
          <Text className="text-xl font-semibold text-[#2f211c]">No moments yet</Text>
          <Text className="text-base leading-6 text-[#6f5a50]">
            Start with one small thing that happened recently. Good, hard, or mixed all counts.
          </Text>
        </View>
      ) : filteredMoments?.length === 0 ? (
        <View className="rounded-3xl bg-white/80 p-4 border border-[#f1dfd2] gap-2">
          <Text className="text-xl font-semibold text-[#2f211c]">
            No {momentFilters.find(([value]) => value === momentFilter)?.[1].toLowerCase()} moments
          </Text>
          <Text className="text-base leading-6 text-[#6f5a50]">
            Try another filter to look back on a different kind of day.
          </Text>
        </View>
      ) : (
        <View className="gap-3">
          {filteredMoments?.map((moment) => (
            <Pressable
              key={moment._id}
              accessibilityLabel={`Open moment: ${moment.summary}`}
              accessibilityRole="button"
              className="rounded-3xl bg-white/85 p-4 border border-[#f1dfd2] gap-3"
              onPress={() => router.push(`/moments/${moment._id}`)}
            >
              <View className="flex-row items-center justify-between gap-3">
                <Text className="text-sm font-semibold text-[#8c766b]">
                  {formatDate(moment.happenedAt)}
                </Text>
                <Text
                  className={`overflow-hidden rounded-full px-3 py-1 text-xs font-bold ${toneStyles[moment.tone]}`}
                >
                  {toneLabels[moment.tone]}
                </Text>
              </View>
              <Text className="text-xl font-bold leading-7 text-[#2f211c]" numberOfLines={2}>
                {moment.summary}
              </Text>
              <Text className="text-base leading-6 text-[#6f5a50]" numberOfLines={2}>
                {moment.feeling}
              </Text>
              {moment.tags.length > 0 ? (
                <View className="flex-row flex-wrap gap-2">
                  {moment.tags.map((tag) => (
                    <Text
                      key={tag}
                      className="rounded-full bg-[#f4ecff] px-3 py-1 text-xs text-[#5b21b6]"
                    >
                      {tag}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
