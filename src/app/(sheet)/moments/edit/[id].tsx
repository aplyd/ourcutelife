import { useMutation, useQuery } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useSession } from "@/lib/betterAuth";

type Tone = "good" | "bad" | "mixed";

export default function EditMomentScreen(): JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const moment = useQuery(api.moments.getMine, id ? { momentId: id as Id<"moments"> } : "skip");
  const updateMoment = useMutation(api.moments.update);
  const [summary, setSummary] = useState("");
  const [feeling, setFeeling] = useState("");
  const [tone, setTone] = useState<Tone>("good");
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!moment) return;
    setSummary(moment.summary);
    setFeeling(moment.feeling);
    setTone(moment.tone);
    setDateText(new Date(moment.happenedAt).toISOString().slice(0, 10));
  }, [moment]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || moment === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;
  if (!moment)
    return (
      <View className="flex-1 bg-[#fff8f1] p-3">
        <Text>Moment unavailable.</Text>
      </View>
    );

  async function handleSave() {
    const happenedAt = new Date(`${dateText}T12:00:00`).getTime();
    if (!Number.isFinite(happenedAt)) {
      setError("Enter the date as YYYY-MM-DD.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await updateMoment({
        momentId: moment!._id,
        happenedAt,
        summary,
        feeling,
        tone,
        tags: moment!.tags,
        partnerCouldDo: moment!.partnerCouldDo,
        authorCouldDo: moment!.authorCouldDo,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save moment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-3 pt-8 pb-10 gap-4">
      <View className="items-center">
        <View className="h-1.5 w-12 rounded-full bg-[#d8c2b4]" />
      </View>
      <Text className="text-3xl font-bold text-[#2f211c]">Edit moment</Text>
      <TextInput
        className="h-12 rounded-2xl border border-[#e6d2c2] bg-white px-4 text-base text-[#2f211c]"
        value={dateText}
        onChangeText={setDateText}
      />
      <TextInput
        multiline
        className="min-h-28 rounded-2xl border border-[#e6d2c2] bg-white px-4 py-3 text-base text-[#2f211c]"
        value={summary}
        onChangeText={setSummary}
        textAlignVertical="top"
      />
      <TextInput
        multiline
        className="min-h-24 rounded-2xl border border-[#e6d2c2] bg-white px-4 py-3 text-base text-[#2f211c]"
        value={feeling}
        onChangeText={setFeeling}
        textAlignVertical="top"
      />
      <View className="flex-row gap-2">
        {(["good", "mixed", "bad"] as const).map((item) => (
          <Pressable
            key={item}
            className={`flex-1 rounded-full py-3 items-center ${tone === item ? "bg-[#2f211c]" : "bg-white border border-[#e6d2c2]"}`}
            onPress={() => setTone(item)}
          >
            <Text className={tone === item ? "text-white" : "text-[#6f5a50]"}>
              {item === "bad" ? "hard" : item}
            </Text>
          </Pressable>
        ))}
      </View>
      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable
        className="h-14 rounded-full bg-[#2f211c] items-center justify-center"
        disabled={isSaving}
        onPress={handleSave}
      >
        <Text className="font-bold text-white">{isSaving ? "Saving…" : "Save changes"}</Text>
      </Pressable>
    </ScrollView>
  );
}
