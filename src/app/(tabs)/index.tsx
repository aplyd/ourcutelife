import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import AnimatedRollingNumber from "react-native-animated-rolling-numbers";

import { api } from "../../../convex/_generated/api";
import { useAuthSession } from "@/lib/authSession";

export default function TodayTab(): JSX.Element {
  const { userId, sessionToken } = useAuthSession();
  const viewer = useQuery(api.auth.viewer, {
    userId: userId ?? undefined,
    sessionToken: sessionToken ?? undefined,
  });
  const todayPrompt = useQuery(api.prompts.today, {
    userId: userId ?? undefined,
    sessionToken: sessionToken ?? undefined,
  });
  const saveAnswer = useMutation(api.prompts.answer);
  const [answer, setAnswer] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  if (!userId || !sessionToken) return <Redirect href="/auth" />;
  if (viewer === undefined || todayPrompt === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple) return <Redirect href="/pairing" />;
  const promptData = todayPrompt!;

  const anniversaryDate = viewer.couple.anniversaryDate;
  const daysTogether = anniversaryDate
    ? Math.max(0, Math.floor((Date.now() - anniversaryDate) / 86_400_000))
    : 0;

  async function handleSaveAnswer() {
    if (!userId || !sessionToken || !answer.trim()) return;
    setIsSaving(true);
    try {
      await saveAnswer({
        userId,
        sessionToken,
        promptDate: promptData.promptDate,
        prompt: promptData.prompt,
        response: answer,
      });
      setAnswer("");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View className="flex-1 bg-[#fff8f1] px-6 pt-16 gap-6">
      <View>
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Today
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Your relationship check-in</Text>
      </View>

      <View className="rounded-3xl bg-white/80 p-5 border border-[#f1dfd2] gap-2">
        <Text className="text-sm text-[#8c766b]">Together for</Text>
        <View className="flex-row items-end gap-2">
          <AnimatedRollingNumber
            value={daysTogether}
            textStyle={{ fontSize: 48, fontWeight: "800", color: "#2f211c" }}
          />
          <Text className="pb-2 text-lg font-semibold text-[#6f5a50]">days</Text>
        </View>
      </View>

      <View className="rounded-3xl bg-[#2f211c] p-5 gap-3">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#d8c2b4]">
          Daily prompt
        </Text>
        <Text className="text-2xl font-bold leading-8 text-[#fff8f1]">{promptData.prompt}</Text>
        {promptData.response ? (
          <Text className="rounded-2xl bg-white/10 p-3 text-[#fff8f1]">
            Your answer: {promptData.response}
          </Text>
        ) : (
          <>
            <TextInput
              multiline
              className="min-h-20 rounded-2xl bg-white/95 px-4 py-3 text-base leading-6 text-[#2f211c]"
              placeholder="Answer privately for now."
              textAlignVertical="top"
              value={answer}
              onChangeText={setAnswer}
            />
            <Pressable
              className="h-11 rounded-full bg-[#fff8f1] items-center justify-center"
              disabled={isSaving || !answer.trim()}
              onPress={handleSaveAnswer}
            >
              <Text className="font-semibold text-[#2f211c]">
                {isSaving ? "Saving…" : "Save answer"}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      <View className="rounded-3xl bg-white/80 p-5 border border-[#f1dfd2] gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Weekly topic
        </Text>
        <Text className="text-xl font-bold leading-7 text-[#2f211c]">{promptData.weeklyTopic}</Text>
      </View>

      <Pressable
        className="h-14 rounded-full bg-[#7c3aed] items-center justify-center"
        onPress={() => router.push("/moments/new")}
      >
        <Text className="font-semibold text-white">Log a moment</Text>
      </Pressable>
    </View>
  );
}
