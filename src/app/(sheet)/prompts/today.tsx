import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function TodayPromptSheet(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const todayPrompt = useQuery(api.prompts.today, {});
  const saveAnswer = useMutation(api.prompts.answer);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (todayPrompt?.response) setAnswer(todayPrompt.response);
  }, [todayPrompt?.response]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || todayPrompt === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const promptData = todayPrompt;

  async function handleSave() {
    if (!answer.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await saveAnswer({
        promptDate: promptData.promptDate,
        prompt: promptData.prompt,
        response: answer,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save today's answer.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-8 pb-10 gap-5">
      <View className="items-center">
        <View className="h-1.5 w-12 rounded-full bg-[#d8c2b4]" />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Daily prompt
        </Text>
        <Text className="text-3xl font-bold leading-10 text-[#2f211c]">{todayPrompt.prompt}</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Brief and honest is enough. This gives the coach context, but it is not saved as a moment.
        </Text>
      </View>
      <TextInput
        multiline
        className="min-h-36 rounded-3xl border border-[#e6d2c2] bg-white/90 px-4 py-4 text-base leading-6 text-[#2f211c]"
        placeholder="Write your answer…"
        textAlignVertical="top"
        value={answer}
        onChangeText={setAnswer}
      />
      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable
        className={`h-14 rounded-full items-center justify-center ${answer.trim() && !isSaving ? "bg-[#2f211c]" : "bg-[#d8c2b4]"}`}
        disabled={!answer.trim() || isSaving}
        onPress={handleSave}
      >
        <Text className="font-bold text-white">{isSaving ? "Saving…" : "Submit answer"}</Text>
      </Pressable>
    </ScrollView>
  );
}
