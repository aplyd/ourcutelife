import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import AnimatedRollingNumber from "react-native-animated-rolling-numbers";

import { api } from "../../../convex/_generated/api";
import { authClient, useSession } from "@/lib/betterAuth";

function formatAnsweredAt(timestamp: number | null | undefined): string | null {
  if (!timestamp) return null;
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function TodayTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const todayPrompt = useQuery(api.prompts.today, {});
  const saveAnswer = useMutation(api.prompts.answer);
  const [answer, setAnswer] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (todayPrompt?.response && !isEditing) setAnswer(todayPrompt.response);
  }, [isEditing, todayPrompt?.response]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
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
  const hasAnswered = Boolean(promptData.response);
  const shouldShowEditor = !hasAnswered || isEditing;
  const answeredAt = formatAnsweredAt(promptData.answeredAt);
  const partnerAnsweredAt = formatAnsweredAt(promptData.partnerResponse?.answeredAt ?? null);

  async function handleSaveAnswer() {
    if (!betterAuthSession.data?.session || !answer.trim()) return;
    setError(null);
    setIsSaving(true);
    try {
      await saveAnswer({
        promptDate: promptData.promptDate,
        prompt: promptData.prompt,
        response: answer,
      });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save today's answer.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-28 gap-6">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Today
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Your relationship check-in</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Answer privately. Your partner's answer unlocks only after both of you have answered.
        </Text>
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

      <View className="rounded-3xl bg-[#2f211c] p-5 gap-4">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#d8c2b4]">
          Daily prompt
        </Text>
        <Text className="text-2xl font-bold leading-8 text-[#fff8f1]">{promptData.prompt}</Text>

        {shouldShowEditor ? (
          <>
            <TextInput
              multiline
              className="min-h-28 rounded-2xl bg-white/95 px-4 py-3 text-base leading-6 text-[#2f211c]"
              placeholder="Write the honest version, not the performative one."
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
                {isSaving ? "Saving…" : hasAnswered ? "Save edit" : "Save answer"}
              </Text>
            </Pressable>
            {hasAnswered ? (
              <Pressable className="items-center" onPress={() => setIsEditing(false)}>
                <Text className="text-sm font-semibold text-[#d8c2b4]">Cancel edit</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <View className="gap-3">
            <View className="rounded-2xl bg-white/10 p-3 gap-2">
              <Text className="text-xs font-semibold uppercase tracking-widest text-[#d8c2b4]">
                Your answer{answeredAt ? ` · ${answeredAt}` : ""}
              </Text>
              <Text className="text-base leading-6 text-[#fff8f1]">{promptData.response}</Text>
            </View>
            <Pressable
              className="h-10 rounded-full border border-[#d8c2b4] items-center justify-center"
              onPress={() => setIsEditing(true)}
            >
              <Text className="font-semibold text-[#fff8f1]">Edit answer</Text>
            </Pressable>
          </View>
        )}
        {error ? <Text className="text-sm text-red-200">{error}</Text> : null}
      </View>

      <View className="rounded-3xl bg-white/80 p-5 border border-[#f1dfd2] gap-3">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Partner reveal
        </Text>
        {promptData.isRevealed && promptData.partnerResponse ? (
          <View className="gap-2">
            <Text className="text-xl font-bold text-[#2f211c]">
              Your partner answered{partnerAnsweredAt ? ` at ${partnerAnsweredAt}` : ""}
            </Text>
            <Text className="rounded-2xl bg-[#f4ecff] p-4 text-base leading-6 text-[#2f211c]">
              {promptData.partnerResponse.response}
            </Text>
          </View>
        ) : hasAnswered ? (
          <View className="gap-2">
            <Text className="text-xl font-bold text-[#2f211c]">Waiting on your partner</Text>
            <Text className="text-base leading-6 text-[#6f5a50]">
              Your answer is saved. Their answer will appear here after they answer today's prompt.
            </Text>
          </View>
        ) : promptData.partnerHasAnswered ? (
          <View className="gap-2">
            <Text className="text-xl font-bold text-[#2f211c]">Your partner already answered</Text>
            <Text className="text-base leading-6 text-[#6f5a50]">
              Answer today’s prompt to unlock what they wrote.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            <Text className="text-xl font-bold text-[#2f211c]">
              Both answers are private for now
            </Text>
            <Text className="text-base leading-6 text-[#6f5a50]">
              Once both of you answer, you’ll be able to read each other’s responses.
            </Text>
          </View>
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

      <Pressable className="items-center" onPress={() => void authClient.signOut()}>
        <Text className="text-sm text-[#8c766b]">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
