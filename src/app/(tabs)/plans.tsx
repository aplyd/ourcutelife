import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MeHeaderButton } from "@/components/MeHeaderButton";
import { useSession } from "@/lib/betterAuth";

type Category = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
const categories: Array<{ value: Category; label: string }> = [
  { value: "food", label: "Food" },
  { value: "drinks", label: "Drinks" },
  { value: "entertainment", label: "Entertainment" },
  { value: "activity", label: "Activity" },
  { value: "intimacy", label: "Intimacy" },
];

export default function PlansTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const [enabledCategories, setEnabledCategories] = useState<Category[]>(
    categories.map((item) => item.value),
  );
  const matches = useQuery(api.plans.matches, {});
  const randomPicks = useQuery(api.plans.randomMatchesByCategories, {
    categories: enabledCategories,
  });
  const voteArchive = useMutation(api.plans.voteArchive);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || matches === undefined || randomPicks === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const filteredMatches = matches.filter((match) =>
    enabledCategories.includes(match.idea.category as Category),
  );

  function toggleCategory(category: Category) {
    setEnabledCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  const currentRandomPicks = randomPicks;

  function showDicePicks() {
    if (!currentRandomPicks.length) {
      Alert.alert("No matched plans", "No matched plan items in the selected categories yet.");
      return;
    }
    Alert.alert(
      "Dice picked",
      currentRandomPicks.map((pick) => `${pick.idea.category}: ${pick.idea.title}`).join("\n"),
    );
  }

  async function requestArchive(matchId: Id<"planMatches">) {
    await voteArchive({ matchId });
    Alert.alert("Archive requested", "This disappears after both partners agree to archive it.");
  }

  return (
    <View className="flex-1 bg-[#fff8f1]">
      <MeHeaderButton />
      <ScrollView className="flex-1" contentContainerClassName="px-3 pt-16 pb-32 gap-4">
        <View className="gap-2 pr-20">
          <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
            Plans
          </Text>
          <Text className="text-4xl font-bold text-[#2f211c]">Matched plans</Text>
          <Text className="text-base leading-6 text-[#6f5a50]">
            Things you both said yes to. Archive requires both partners.
          </Text>
        </View>

        <View className="gap-3 rounded-3xl bg-white/85 p-4 border border-[#f1dfd2]">
          <View className="flex-row items-center justify-between">
            <Text className="text-lg font-bold text-[#2f211c]">Filter</Text>
            <Pressable
              className="h-10 w-10 rounded-full bg-[#2f211c] items-center justify-center"
              onPress={showDicePicks}
            >
              <Text className="text-xl">🎲</Text>
            </Pressable>
          </View>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((item) => {
              const active = enabledCategories.includes(item.value);
              return (
                <Pressable
                  key={item.value}
                  className={`rounded-full px-4 py-2 ${active ? "bg-[#2f211c]" : "bg-[#fff8f1] border border-[#e6d2c2]"}`}
                  onPress={() => toggleCategory(item.value)}
                >
                  <Text className={active ? "text-white" : "text-[#6f5a50]"}>{item.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {filteredMatches.length ? (
          filteredMatches.map((match) => (
            <View
              key={match._id}
              className="rounded-3xl bg-white/90 p-4 border border-[#f1dfd2] gap-3"
            >
              <Text className="text-sm font-bold uppercase tracking-widest text-[#8c766b]">
                {match.idea.category}
              </Text>
              <Text className="text-2xl font-bold text-[#2f211c]">{match.idea.title}</Text>
              <Text className="text-base leading-6 text-[#6f5a50]">{match.idea.description}</Text>
              <View className="flex-row flex-wrap gap-2">
                {(match.idea.subcategories ?? match.idea.vibeTags ?? []).map((tag: string) => (
                  <Text
                    key={tag}
                    className="rounded-full bg-[#f4ecff] px-3 py-1 text-sm text-[#5b21b6]"
                  >
                    #{tag}
                  </Text>
                ))}
              </View>
              <Pressable
                className="h-11 rounded-full border border-[#fecdd3] bg-[#fff1f2] items-center justify-center"
                onPress={() => requestArchive(match._id)}
              >
                <Text className="font-bold text-[#be123c]">
                  Archive request ({match.archiveVoteCount ?? 0}/2)
                </Text>
              </Pressable>
            </View>
          ))
        ) : (
          <Text className="text-base text-[#6f5a50]">
            No matched plans in the selected categories yet.
          </Text>
        )}
      </ScrollView>

      <Pressable
        className="absolute bottom-28 right-3 h-16 w-16 rounded-full bg-[#7c3aed] items-center justify-center shadow-lg"
        onPress={() => router.push("/plans/new")}
      >
        <Text className="text-4xl leading-none text-white">＋</Text>
      </Pressable>
    </View>
  );
}
