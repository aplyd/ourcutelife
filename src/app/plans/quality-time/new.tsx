import { useAppMutation, useAppQuery } from "@/lib/devMock";
import {
  createQualityTimeDraft,
  type QualityTimeCategory,
  type QualityTimeTiming,
} from "@/lib/qualityTimeApi";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

const timingChoices = [
  { value: "now" as const, label: "Now" },
  { value: "future" as const, label: "Plan for later" },
];

const categories: Array<{ value: QualityTimeCategory; label: string }> = [
  { value: "eat", label: "Eat" },
  { value: "drink", label: "Drink" },
  { value: "explore_adventure", label: "Explore/Adventure" },
  { value: "entertainment", label: "Entertainment" },
  { value: "romance", label: "Romance" },
];

export default function NewQualityTimeScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useAppQuery(api.auth.viewer, {});
  const createDraft = useAppMutation(createQualityTimeDraft);
  const [timingKind, setTimingKind] = useState<QualityTimeTiming["kind"]>("now");
  const [futureDateTime, setFutureDateTime] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<QualityTimeCategory[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scheduledFor = useMemo(() => Date.parse(futureDateTime.trim()), [futureDateTime]);
  const hasValidTiming =
    timingKind === "now" ||
    (futureDateTime.trim().length > 0 &&
      Number.isFinite(scheduledFor) &&
      scheduledFor > Date.now());
  const canSubmit = selectedCategories.length > 0 && hasValidTiming && !isSubmitting;

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-app-bg">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  function toggleCategory(category: QualityTimeCategory) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category],
    );
  }

  async function handleCreateDraft() {
    if (!canSubmit) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const timing: QualityTimeTiming =
        timingKind === "now" ? { kind: "now" } : { kind: "future", scheduledFor };
      const result = await createDraft({ timing, selectedCategories });
      // The request route is added in the next RED/GREEN stage; Expo's generated route union
      // cannot include its dynamic segment until that file exists.
      router.replace(`/plans/quality-time/${result.requestId}` as never);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start Quality Time. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ScrollView
      className="flex-1 bg-app-bg"
      contentContainerClassName="px-3 pt-16 pb-10 gap-5"
      keyboardShouldPersistTaps="handled"
    >
      <View className="flex-row items-center justify-between">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to Plans"
          className="h-11 rounded-full border border-soft bg-card px-4 items-center justify-center"
          onPress={() => router.back()}
        >
          <Text className="font-bold text-ink">Back</Text>
        </Pressable>
        <Text className="text-lg font-bold text-ink">Quality Time</Text>
        <View className="w-16" />
      </View>

      <View className="gap-2">
        <Text className="text-4xl font-bold text-ink">What sounds good together?</Text>
        <Text className="text-base leading-6 text-muted">
          Pick when and what you’re open to. Your option choices stay private while you build a
          shortlist.
        </Text>
      </View>

      <View className="gap-3">
        <Text className="text-sm font-semibold text-muted">When?</Text>
        <View className="flex-row flex-wrap gap-2">
          {timingChoices.map((item) => (
            <Pressable
              key={item.value}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: timingKind === item.value }}
              className={`rounded-full px-4 py-3 ${timingKind === item.value ? "bg-accent" : "bg-card border border-soft"}`}
              onPress={() => setTimingKind(item.value)}
            >
              <Text
                className={
                  timingKind === item.value ? "font-bold text-app-bg" : "font-bold text-ink"
                }
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {timingKind === "future" ? (
          <View className="gap-2">
            <Text className="text-sm text-muted">Future date and time</Text>
            <TextInput
              accessibilityLabel="Quality Time future date and time"
              className="h-12 rounded-2xl border border-soft bg-card px-4 text-base text-ink"
              value={futureDateTime}
              onChangeText={setFutureDateTime}
              placeholder="2026-08-09 7:00 PM"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {futureDateTime.trim() && !hasValidTiming ? (
              <Text className="text-sm text-red-700">
                Enter a valid date and time in the future.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <View className="gap-3">
        <Text className="text-sm font-semibold text-muted">What are you open to?</Text>
        <View className="flex-row flex-wrap gap-2">
          {categories.map((item) => {
            const selected = selectedCategories.includes(item.value);
            return (
              <Pressable
                key={item.value}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: selectedCategories.includes(item.value) }}
                className={`rounded-full px-4 py-3 ${selected ? "bg-accent" : "bg-card border border-soft"}`}
                onPress={() => toggleCategory(item.value)}
              >
                <Text className={selected ? "font-bold text-app-bg" : "font-bold text-ink"}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!selectedCategories.length ? (
          <Text className="text-sm text-muted">Choose at least one category to continue.</Text>
        ) : null}
      </View>

      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Choose private options"
        accessibilityState={{ disabled: !canSubmit, busy: isSubmitting }}
        className={`h-14 items-center justify-center rounded-full ${canSubmit ? "bg-ink" : "bg-soft"}`}
        disabled={!canSubmit}
        onPress={handleCreateDraft}
      >
        <Text className="font-bold text-app-bg">
          {isSubmitting ? "Starting…" : "Choose private options"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
