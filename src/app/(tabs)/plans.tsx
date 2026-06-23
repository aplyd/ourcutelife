import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MeHeaderButton } from "@/components/MeHeaderButton";
import { useSession } from "@/lib/betterAuth";

type Category = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
type DateSort = "suggested" | "popular" | "rating" | "trending";

const categories: Array<{ value: Category; label: string }> = [
  { value: "food", label: "Food" },
  { value: "drinks", label: "Drinks" },
  { value: "entertainment", label: "Entertainment" },
  { value: "activity", label: "Activity" },
  { value: "intimacy", label: "Intimacy" },
];

const dateSorts: Array<{ value: DateSort; label: string }> = [
  { value: "suggested", label: "Suggested" },
  { value: "popular", label: "Popular" },
  { value: "rating", label: "Rating" },
  { value: "trending", label: "Trending" },
];

export default function PlansTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const [enabledCategories, setEnabledCategories] = useState<Category[]>(
    categories.map((item) => item.value),
  );
  const [dateSort, setDateSort] = useState<DateSort>("suggested");
  const [hasRequestedDemoSeed, setHasRequestedDemoSeed] = useState(false);
  const matches = useQuery(api.plans.matches, {});
  const randomPicks = useQuery(api.plans.randomMatchesByCategories, {
    categories: enabledCategories,
  });
  const leaderboard = useQuery(api.plans.dateLeaderboard, { sort: dateSort });
  const ourDates = useQuery(api.plans.ourDates, {});
  const voteArchive = useMutation(api.plans.voteArchive);
  const likeDate = useMutation(api.plans.likeDate);
  const saveDate = useMutation(api.plans.saveDate);
  const scheduleDate = useMutation(api.plans.scheduleDate);
  const completeDate = useMutation(api.plans.completeDate);
  const rateDate = useMutation(api.plans.rateDate);
  const seedDemoPartnerData = useMutation(api.plans.seedDemoPartnerData);

  useEffect(() => {
    if (
      hasRequestedDemoSeed ||
      viewer === undefined ||
      matches === undefined ||
      ourDates === undefined ||
      !viewer?.couple ||
      matches.length > 0 ||
      ourDates.length > 0
    )
      return;
    setHasRequestedDemoSeed(true);
    void seedDemoPartnerData();
  }, [hasRequestedDemoSeed, matches, ourDates, seedDemoPartnerData, viewer]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || matches === undefined || ourDates === undefined)
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const filteredMatches = matches.filter((match) =>
    enabledCategories.includes(match.idea.category as Category),
  );
  const currentRandomPicks = randomPicks ?? [];
  const currentLeaderboard = leaderboard ?? [];

  function toggleCategory(category: Category) {
    setEnabledCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  function showDicePicks() {
    if (!currentRandomPicks.length) {
      Alert.alert(
        "No matched items",
        "No matched activities or places in the selected categories yet.",
      );
      return;
    }
    Alert.alert(
      "Dice picked",
      currentRandomPicks.map((pick) => `${pick.idea.kind}: ${pick.idea.title}`).join("\n"),
    );
  }

  async function requestArchive(matchId: Id<"planMatches">) {
    await voteArchive({ matchId });
    Alert.alert("Archive requested", "This disappears after both partners agree to archive it.");
  }

  async function scheduleTonight(datePlanId: Id<"datePlans">) {
    const tonight = new Date();
    tonight.setHours(19, 0, 0, 0);
    if (tonight.getTime() < Date.now()) tonight.setDate(tonight.getDate() + 1);
    await scheduleDate({ datePlanId, scheduledFor: tonight.getTime() });
    Alert.alert("Scheduled", "Added to Our Dates for the next 7pm slot.");
  }

  async function quickRate(datePlanId: Id<"datePlans">, rating: number) {
    await completeDate({ datePlanId });
    await rateDate({ datePlanId, rating, tags: rating >= 3 ? ["would-do-again"] : ["not-again"] });
  }

  return (
    <View className="flex-1 bg-app-bg">
      <MeHeaderButton />
      <ScrollView className="flex-1" contentContainerClassName="px-3 pt-16 pb-32 gap-5">
        <View className="gap-2 pr-20">
          <Text className="text-sm font-semibold uppercase tracking-widest text-muted">Plans</Text>
          <Text className="text-4xl font-bold text-ink">Our date board</Text>
          <Text className="text-base leading-6 text-muted">
            Swipe on activities and places. Dates are combinations you can like, save, schedule,
            complete, and rate.
          </Text>
        </View>

        <Section title="Our Dates" subtitle="The decision list for date night.">
          {ourDates.length ? (
            ourDates.map((date) => (
              <DateCard
                key={date._id}
                date={date}
                onLike={likeDate}
                onSave={saveDate}
                onSchedule={scheduleTonight}
                onComplete={completeDate}
                onRate={quickRate}
              />
            ))
          ) : (
            <EmptyCopy text="No saved dates yet. Like or save a suggested date below." />
          )}
        </Section>

        <Section
          title="Explore Dates"
          subtitle="Leaderboard-style date ideas built from matched items."
        >
          <View className="flex-row flex-wrap gap-2">
            {dateSorts.map((item) => {
              const active = dateSort === item.value;
              return (
                <Pressable
                  key={item.value}
                  className={`rounded-full px-4 py-2 ${active ? "bg-accent" : "bg-card border border-soft"}`}
                  onPress={() => setDateSort(item.value)}
                >
                  <Text
                    className={active ? "font-semibold text-app-bg" : "font-semibold text-muted"}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {currentLeaderboard.length ? (
            currentLeaderboard.map((date) => (
              <DateCard
                key={date._id}
                date={date}
                onLike={likeDate}
                onSave={saveDate}
                onSchedule={scheduleTonight}
                onComplete={completeDate}
                onRate={quickRate}
              />
            ))
          ) : (
            <EmptyCopy text="No date recommendations yet. Matches will generate starter dates." />
          )}
        </Section>

        <Section
          title="Matched Items"
          subtitle="History of mutual yeses. These are ingredients, not dates."
        >
          <View className="gap-3 rounded-3xl bg-card p-4 border border-soft">
            <View className="flex-row items-center justify-between">
              <Text className="text-lg font-bold text-ink">Filter</Text>
              <Pressable
                className="h-10 w-10 rounded-full bg-accent items-center justify-center"
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
                    className={`rounded-full px-4 py-2 ${active ? "bg-accent" : "bg-app-bg border border-soft"}`}
                    onPress={() => toggleCategory(item.value)}
                  >
                    <Text className={active ? "text-app-bg" : "text-muted"}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          {filteredMatches.length ? (
            filteredMatches.map((match) => {
              const relatedDates = currentLeaderboard
                .filter((date) => date.items?.some((item) => item._id === match.idea._id))
                .slice(0, 2);
              return (
                <View key={match._id} className="rounded-3xl bg-card p-4 border border-soft gap-3">
                  <Text className="text-sm font-bold uppercase tracking-widest text-muted">
                    {match.idea.kind} · {match.idea.category}
                  </Text>
                  <Text className="text-2xl font-bold text-ink">{match.idea.title}</Text>
                  <Text className="text-base leading-6 text-muted">{match.idea.description}</Text>
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
                  {relatedDates.length ? (
                    <View className="gap-2 rounded-2xl bg-app-bg p-3 border border-soft">
                      <Text className="text-sm font-bold text-ink">
                        People usually pair this with…
                      </Text>
                      {relatedDates.map((date) => (
                        <Pressable
                          key={date._id}
                          className="rounded-2xl bg-card px-3 py-2 border border-soft"
                          onPress={() => saveDate({ datePlanId: date._id })}
                        >
                          <Text className="font-bold text-ink">{date.title}</Text>
                          <Text className="text-xs text-muted">Tap to save to Our Dates</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Pressable
                    className="h-11 rounded-full border border-[#fecdd3] bg-[#fff1f2] items-center justify-center"
                    onPress={() => requestArchive(match._id)}
                  >
                    <Text className="font-bold text-[#be123c]">
                      Archive request ({match.archiveVoteCount ?? 0}/2)
                    </Text>
                  </Pressable>
                </View>
              );
            })
          ) : (
            <EmptyCopy text="No matched activities or places in the selected categories yet." />
          )}
        </Section>
      </ScrollView>

      <Pressable
        className="absolute bottom-28 right-3 h-16 w-16 rounded-full bg-accent items-center justify-center shadow-lg"
        onPress={() => router.push("/plans/new")}
      >
        <Text className="text-4xl leading-none text-white">＋</Text>
      </Pressable>
    </View>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3">
      <View className="gap-1">
        <Text className="text-2xl font-bold text-ink">{title}</Text>
        <Text className="text-sm leading-5 text-muted">{subtitle}</Text>
      </View>
      {children}
    </View>
  );
}

function DateCard({
  date,
  onLike,
  onSave,
  onSchedule,
  onComplete,
  onRate,
}: {
  date: any;
  onLike: any;
  onSave: any;
  onSchedule: any;
  onComplete: any;
  onRate: any;
}) {
  const itemNames = date.items?.map((item: any) => item.title).join(" → ");
  return (
    <View className="rounded-3xl bg-card p-4 border border-soft gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-2xl font-bold text-ink">{date.title}</Text>
        <Text className="rounded-full bg-[#ecfeff] px-3 py-1 text-xs font-bold uppercase text-[#0e7490]">
          {date.savedStatus ?? (date.likedByViewer ? "liked" : "date")}
        </Text>
      </View>
      <Text className="text-base leading-6 text-muted">{date.summary}</Text>
      {itemNames ? <Text className="text-sm font-semibold text-ink">{itemNames}</Text> : null}
      {date.freeformSteps?.length ? (
        <Text className="text-sm leading-5 text-muted">+ {date.freeformSteps.join(" · ")}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Text className="rounded-full bg-app-bg px-3 py-1 text-xs font-semibold text-muted">
          {date.durationMinutes} min
        </Text>
        <Text className="rounded-full bg-app-bg px-3 py-1 text-xs font-semibold text-muted">
          ${date.costLevel}
        </Text>
        <Text className="rounded-full bg-app-bg px-3 py-1 text-xs font-semibold text-muted">
          {date.matchedItemCount} matched
        </Text>
        {date.ratingAverage ? (
          <Text className="rounded-full bg-app-bg px-3 py-1 text-xs font-semibold text-muted">
            ★ {date.ratingAverage.toFixed(1)}
          </Text>
        ) : null}
      </View>
      <View className="flex-row flex-wrap gap-2">
        <Action
          label={date.likedByViewer ? "Liked" : "Like"}
          onPress={() => onLike({ datePlanId: date._id })}
        />
        <Action
          label={date.isSaved ? "Saved" : "Save"}
          onPress={() => onSave({ datePlanId: date._id })}
        />
        <Action label="Schedule" onPress={() => onSchedule(date._id)} />
        <Action label="Complete" onPress={() => onComplete({ datePlanId: date._id })} />
        <Action label="😍" onPress={() => onRate(date._id, 4)} />
      </View>
    </View>
  );
}

function Action({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable className="rounded-full bg-accent px-4 py-2" onPress={onPress}>
      <Text className="font-bold text-app-bg">{label}</Text>
    </Pressable>
  );
}

function EmptyCopy({ text }: { text: string }) {
  return (
    <Text className="rounded-3xl bg-card p-4 text-base leading-6 text-muted border border-soft">
      {text}
    </Text>
  );
}
