import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

type Tone = "good" | "bad" | "mixed";

const toneOptions: Array<{ value: Tone; label: string; helper: string }> = [
  { value: "good", label: "Good", helper: "Something worth remembering" },
  { value: "mixed", label: "Mixed", helper: "Complicated but meaningful" },
  { value: "bad", label: "Hard", helper: "Something to repair later" },
];

const suggestedTags = [
  "communication",
  "affection",
  "logistics",
  "quality time",
  "stress",
  "family",
  "chores",
  "intimacy",
];

export default function NewMomentScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const createMoment = useMutation(api.moments.create);
  const [happenedAtText, setHappenedAtText] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState("");
  const [feeling, setFeeling] = useState("");
  const [tone, setTone] = useState<Tone>("good");
  const [partnerCouldDo, setPartnerCouldDo] = useState("");
  const [authorCouldDo, setAuthorCouldDo] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const needsRepairFields = tone === "bad" || tone === "mixed";
  const canSave = useMemo(
    () => Boolean(betterAuthSession.data?.session && summary.trim() && feeling.trim() && !isSaving),
    [feeling, isSaving, summary],
  );

  function toggleTag(tag: string) {
    setTags((current) =>
      current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag],
    );
  }

  async function handleSave() {
    if (!betterAuthSession.data?.session) return;
    const happenedAt = new Date(`${happenedAtText}T12:00:00`).getTime();
    if (!Number.isFinite(happenedAt)) {
      setError("Enter the date as YYYY-MM-DD.");
      return;
    }

    setError(null);
    setIsSaving(true);
    try {
      const momentId = await createMoment({
        happenedAt,
        summary,
        feeling,
        tone,
        partnerCouldDo,
        authorCouldDo,
        tags,
      });
      router.replace(`/moments/${momentId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this moment.");
    } finally {
      setIsSaving(false);
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

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-10 gap-5">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          New moment
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Capture what happened</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          This raw note is private to you. Shared briefs come later after AI rewrites themes safely.
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Date</Text>
        <TextInput
          className="h-12 rounded-2xl border border-[#e6d2c2] bg-white/80 px-4 text-base text-[#2f211c]"
          placeholder="YYYY-MM-DD"
          value={happenedAtText}
          onChangeText={setHappenedAtText}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">What happened?</Text>
        <TextInput
          multiline
          className="min-h-28 rounded-2xl border border-[#e6d2c2] bg-white/80 px-4 py-3 text-base leading-6 text-[#2f211c]"
          placeholder="Jot down the moment in your own words."
          textAlignVertical="top"
          value={summary}
          onChangeText={setSummary}
        />
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">How did it make you feel?</Text>
        <TextInput
          multiline
          className="min-h-24 rounded-2xl border border-[#e6d2c2] bg-white/80 px-4 py-3 text-base leading-6 text-[#2f211c]"
          placeholder="Name the feeling without polishing it for anyone else."
          textAlignVertical="top"
          value={feeling}
          onChangeText={setFeeling}
        />
      </View>

      <View className="gap-3">
        <Text className="text-sm font-semibold text-[#6f5a50]">This was mostly…</Text>
        <View className="gap-2">
          {toneOptions.map((option) => {
            const selected = option.value === tone;
            return (
              <Pressable
                key={option.value}
                className={`rounded-2xl border p-4 ${selected ? "border-[#7c3aed] bg-[#f4ecff]" : "border-[#e6d2c2] bg-white/80"}`}
                onPress={() => setTone(option.value)}
              >
                <Text className="text-lg font-bold text-[#2f211c]">{option.label}</Text>
                <Text className="text-sm text-[#6f5a50]">{option.helper}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {needsRepairFields ? (
        <View className="gap-4 rounded-3xl bg-[#fff1f2] p-5 border border-[#fecdd3]">
          <Text className="text-lg font-bold text-[#2f211c]">Repair reflections</Text>
          <View className="gap-2">
            <Text className="text-sm font-semibold text-[#6f5a50]">
              What could your partner have done differently?
            </Text>
            <TextInput
              multiline
              className="min-h-20 rounded-2xl border border-[#fecdd3] bg-white/90 px-4 py-3 text-base leading-6 text-[#2f211c]"
              textAlignVertical="top"
              value={partnerCouldDo}
              onChangeText={setPartnerCouldDo}
            />
          </View>
          <View className="gap-2">
            <Text className="text-sm font-semibold text-[#6f5a50]">
              What could you have done differently?
            </Text>
            <TextInput
              multiline
              className="min-h-20 rounded-2xl border border-[#fecdd3] bg-white/90 px-4 py-3 text-base leading-6 text-[#2f211c]"
              textAlignVertical="top"
              value={authorCouldDo}
              onChangeText={setAuthorCouldDo}
            />
          </View>
        </View>
      ) : null}

      <View className="gap-3">
        <Text className="text-sm font-semibold text-[#6f5a50]">Tags</Text>
        <View className="flex-row flex-wrap gap-2">
          {suggestedTags.map((tag) => {
            const selected = tags.includes(tag);
            return (
              <Pressable
                key={tag}
                className={`rounded-full px-3 py-2 ${selected ? "bg-[#7c3aed]" : "bg-white/80 border border-[#e6d2c2]"}`}
                onPress={() => toggleTag(tag)}
              >
                <Text
                  className={`text-sm font-semibold ${selected ? "text-white" : "text-[#6f5a50]"}`}
                >
                  {tag}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}

      <Pressable
        className={`h-14 rounded-full items-center justify-center ${canSave ? "bg-[#2f211c]" : "bg-[#d8c2b4]"}`}
        disabled={!canSave}
        onPress={handleSave}
      >
        <Text className="font-semibold text-[#fff8f1]">
          {isSaving ? "Saving…" : "Save private moment"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
