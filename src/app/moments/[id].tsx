import { useQuery } from "convex/react";
import { Redirect, useLocalSearchParams } from "expo-router";
import type { JSX } from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthSession } from "@/lib/authSession";

const toneLabel = {
  good: "Good",
  mixed: "Mixed",
  bad: "Hard",
} as const;

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default function MomentDetailScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId, sessionToken } = useAuthSession();
  const viewer = useQuery(api.auth.viewer, {
    userId: userId ?? undefined,
    sessionToken: sessionToken ?? undefined,
  });
  const canLoadMoment = Boolean(
    userId && sessionToken && viewer?.couple && viewer.memberCount >= 2,
  );
  const moment = useQuery(
    api.moments.getMine,
    canLoadMoment
      ? {
          userId: userId!,
          sessionToken: sessionToken!,
          momentId: id as Id<"moments">,
        }
      : "skip",
  );

  if (!userId || !sessionToken) return <Redirect href="/auth" />;

  if (viewer === undefined || (canLoadMoment && moment === undefined)) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  if (!moment) {
    return (
      <View className="flex-1 bg-[#fff8f1] px-6 pt-16 gap-3">
        <Text className="text-3xl font-bold text-[#2f211c]">Moment unavailable</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          This note either does not exist or is not yours. Raw moments are private to their author.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-10 gap-5">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Private moment
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">{toneLabel[moment.tone]} moment</Text>
        <Text className="text-base text-[#6f5a50]">{formatDate(moment.happenedAt)}</Text>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-3">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          What happened
        </Text>
        <Text className="text-xl leading-8 text-[#2f211c]">{moment.summary}</Text>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-3">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          How it felt
        </Text>
        <Text className="text-xl leading-8 text-[#2f211c]">{moment.feeling}</Text>
      </View>

      {moment.tone === "bad" || moment.tone === "mixed" ? (
        <View className="gap-4 rounded-3xl bg-[#fff1f2] p-5 border border-[#fecdd3]">
          <Text className="text-lg font-bold text-[#2f211c]">Repair reflections</Text>
          {moment.partnerCouldDo ? (
            <View className="gap-1">
              <Text className="text-sm font-semibold text-[#6f5a50]">Partner could have done</Text>
              <Text className="text-base leading-6 text-[#2f211c]">{moment.partnerCouldDo}</Text>
            </View>
          ) : null}
          {moment.authorCouldDo ? (
            <View className="gap-1">
              <Text className="text-sm font-semibold text-[#6f5a50]">I could have done</Text>
              <Text className="text-base leading-6 text-[#2f211c]">{moment.authorCouldDo}</Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {moment.tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {moment.tags.map((tag) => (
            <Text
              key={tag}
              className="rounded-full bg-[#f4ecff] px-3 py-2 text-sm font-semibold text-[#5b21b6]"
            >
              {tag}
            </Text>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
