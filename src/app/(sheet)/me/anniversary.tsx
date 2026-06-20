import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function EditAnniversarySheet(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const updateAnniversary = useMutation(api.auth.updateAnniversary);
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (viewer?.couple?.anniversaryDate) {
      setDateText(new Date(viewer.couple.anniversaryDate).toISOString().slice(0, 10));
    }
  }, [viewer?.couple?.anniversaryDate]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) return <View className="flex-1 bg-[#fff8f1] items-center justify-center"><ActivityIndicator /></View>;
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  async function handleSave() {
    const anniversaryDate = new Date(`${dateText}T12:00:00`).getTime();
    if (!Number.isFinite(anniversaryDate)) {
      setError("Enter the date as YYYY-MM-DD.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await updateAnniversary({ anniversaryDate });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update anniversary.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-8 pb-10 gap-5">
      <View className="items-center"><View className="h-1.5 w-12 rounded-full bg-[#d8c2b4]" /></View>
      <Text className="text-3xl font-bold text-[#2f211c]">Edit anniversary</Text>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Date</Text>
        <TextInput className="h-12 rounded-2xl border border-[#e6d2c2] bg-white/90 px-4 text-base text-[#2f211c]" value={dateText} onChangeText={setDateText} placeholder="YYYY-MM-DD" />
      </View>
      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable className={`h-14 rounded-full items-center justify-center ${dateText.trim() && !isSaving ? "bg-[#2f211c]" : "bg-[#d8c2b4]"}`} disabled={!dateText.trim() || isSaving} onPress={handleSave}>
        <Text className="font-bold text-white">{isSaving ? "Saving…" : "Save anniversary"}</Text>
      </Pressable>
    </ScrollView>
  );
}
