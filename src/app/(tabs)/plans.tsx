import { useMutation, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useSession } from "@/lib/betterAuth";

type Category = "dinner" | "date" | "activity" | "weekend";
const categories: Category[] = ["dinner", "date", "activity", "weekend"];

export default function PlansTab(): JSX.Element {
  const betterAuthSession = useSession();
  const [category, setCategory] = useState<Category | undefined>();
  const viewer = useQuery(api.auth.viewer, {});
  const canLoad = Boolean(
    betterAuthSession.data?.session && viewer?.couple && viewer.memberCount >= 2,
  );
  const ideas = useQuery(api.plans.list, canLoad ? { category } : "skip");
  const matches = useQuery(api.plans.matches, canLoad ? {} : "skip");
  const seed = useMutation(api.plans.seed);
  const vote = useMutation(api.plans.vote);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    if (!betterAuthSession.data?.session || !canLoad) return;
    void seed({});
  }, [canLoad, seed]);

  async function handleVote(ideaId: Id<"planIdeas">, nextVote: "like" | "pass") {
    if (!betterAuthSession.data?.session) return;
    setIsWorking(true);
    try {
      await vote({
        ideaId,
        vote: nextVote,
      });
    } finally {
      setIsWorking(false);
    }
  }

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  if (ideas === undefined || matches === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  const currentIdea = ideas[0];

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-28 gap-5">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Plans
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">
          Swipe into something you both want
        </Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Like or pass on dinner, date, activity, and weekend ideas. Mutual likes become matches.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Pressable
          className={`rounded-full px-4 py-2 ${category ? "bg-white/80 border border-[#e6d2c2]" : "bg-[#2f211c]"}`}
          onPress={() => setCategory(undefined)}
        >
          <Text className={category ? "text-[#6f5a50]" : "text-[#fff8f1]"}>all</Text>
        </Pressable>
        {categories.map((item) => (
          <Pressable
            key={item}
            className={`rounded-full px-4 py-2 ${category === item ? "bg-[#2f211c]" : "bg-white/80 border border-[#e6d2c2]"}`}
            onPress={() => setCategory(item)}
          >
            <Text className={category === item ? "text-[#fff8f1]" : "text-[#6f5a50]"}>{item}</Text>
          </Pressable>
        ))}
      </View>

      {currentIdea ? (
        <View className="rounded-[32px] bg-white/90 p-6 border border-[#f1dfd2] gap-4">
          <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
            {currentIdea.category} · {"$".repeat(currentIdea.costLevel)} ·{" "}
            {currentIdea.durationMinutes} min
          </Text>
          <Text className="text-3xl font-bold leading-9 text-[#2f211c]">{currentIdea.title}</Text>
          <Text className="text-lg leading-7 text-[#6f5a50]">{currentIdea.description}</Text>
          <View className="flex-row flex-wrap gap-2">
            {currentIdea.vibeTags.map((tag) => (
              <Text
                key={tag}
                className="rounded-full bg-[#f4ecff] px-3 py-1 text-sm text-[#5b21b6]"
              >
                {tag}
              </Text>
            ))}
          </View>
          <View className="flex-row gap-3">
            <Pressable
              className="flex-1 h-14 rounded-full bg-[#f1dfd2] items-center justify-center"
              disabled={isWorking}
              onPress={() => handleVote(currentIdea._id, "pass")}
            >
              <Text className="font-bold text-[#6f5a50]">Pass</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-14 rounded-full bg-[#7c3aed] items-center justify-center"
              disabled={isWorking}
              onPress={() => handleVote(currentIdea._id, "like")}
            >
              <Text className="font-bold text-white">Like</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2]">
          <Text className="text-xl font-bold text-[#2f211c]">No more ideas in this lane.</Text>
          <Text className="text-base leading-6 text-[#6f5a50]">
            Switch categories or wait for the generated-idea version.
          </Text>
        </View>
      )}

      <View className="gap-3">
        <Text className="text-2xl font-bold text-[#2f211c]">Matches</Text>
        {matches.length ? (
          matches.map((match) => (
            <View
              key={match._id}
              className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-1"
            >
              <Text className="text-xl font-bold text-[#2f211c]">{match.idea.title}</Text>
              <Text className="text-base text-[#6f5a50]">{match.idea.description}</Text>
            </View>
          ))
        ) : (
          <Text className="text-base text-[#6f5a50]">No mutual likes yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}
