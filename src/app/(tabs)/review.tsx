import { useMutation, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { GiftedChat, type IMessage } from "react-native-gifted-chat";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuthSession } from "@/lib/authSession";

export default function ReviewTab(): JSX.Element {
  const { userId, sessionToken } = useAuthSession();
  const viewer = useQuery(api.auth.viewer, {
    userId: userId ?? undefined,
    sessionToken: sessionToken ?? undefined,
  });
  const canLoad = Boolean(userId && sessionToken && viewer?.couple && viewer.memberCount >= 2);
  const reviews = useQuery(
    api.reviews.latestMine,
    canLoad ? { userId: userId!, sessionToken: sessionToken! } : "skip",
  );
  const chatRows = useQuery(
    api.reviews.chatMessages,
    canLoad ? { userId: userId!, sessionToken: sessionToken! } : "skip",
  );
  const stats = useQuery(
    api.stats.mine,
    canLoad ? { userId: userId!, sessionToken: sessionToken! } : "skip",
  );
  const generateReview = useMutation(api.reviews.generateMine);
  const shareReview = useMutation(api.reviews.share);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = reviews?.[0] ?? null;
  const messages = useMemo<IMessage[]>(() => {
    return (chatRows ?? []).map((message) => ({
      _id: message._id,
      text: message.text,
      createdAt: new Date(message.createdAt),
      user: {
        _id: message.senderKind === "ai" ? "ai" : (message.senderUserId ?? "partner"),
        name: message.senderKind === "ai" ? "Our Cute Life" : "Partner",
      },
    }));
  }, [chatRows]);

  async function handleGenerate() {
    if (!userId || !sessionToken) return;
    setError(null);
    setIsWorking(true);
    try {
      await generateReview({ userId, sessionToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate review.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleShare(reviewId: Id<"monthlyReviews">) {
    if (!userId || !sessionToken) return;
    setError(null);
    setIsWorking(true);
    try {
      await shareReview({ userId, sessionToken, reviewId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share review.");
    } finally {
      setIsWorking(false);
    }
  }

  if (!userId || !sessionToken) return <Redirect href="/auth" />;
  if (viewer === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  if (reviews === undefined || chatRows === undefined || stats === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-28 gap-5">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Review
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">
          Private reflection, then shared conversation
        </Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Generate your private monthly draft first. When it feels safe, share a relationship-safe
          summary into the couple chat.
        </Text>
      </View>

      <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-3">
        <Text className="text-xl font-bold text-[#2f211c]">Your relationship stats</Text>
        <View className="flex-row flex-wrap gap-3">
          <Text className="rounded-2xl bg-[#f4ecff] px-4 py-3 text-[#5b21b6]">
            {stats.daysTogether} days together
          </Text>
          <Text className="rounded-2xl bg-emerald-100 px-4 py-3 text-emerald-900">
            {stats.toneCounts.good} good
          </Text>
          <Text className="rounded-2xl bg-amber-100 px-4 py-3 text-amber-900">
            {stats.toneCounts.mixed} mixed
          </Text>
          <Text className="rounded-2xl bg-rose-100 px-4 py-3 text-rose-900">
            {stats.toneCounts.bad} hard
          </Text>
        </View>
        {stats.topTags.length ? (
          <Text className="text-sm text-[#6f5a50]">
            Top themes: {stats.topTags.map((tag) => tag.tag).join(", ")}
          </Text>
        ) : null}
      </View>

      <Pressable
        className="h-14 rounded-full bg-[#7c3aed] items-center justify-center"
        disabled={isWorking}
        onPress={handleGenerate}
      >
        <Text className="font-semibold text-white">
          {isWorking ? "Working…" : "Generate private monthly review"}
        </Text>
      </Pressable>

      {latest ? (
        <View className="rounded-3xl bg-white/85 p-5 border border-[#f1dfd2] gap-3">
          <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
            {latest.month}
          </Text>
          <Text className="text-xl font-bold leading-7 text-[#2f211c]">{latest.summary}</Text>
          <Text className="font-semibold text-[#2f211c]">Questions</Text>
          {latest.questions.map((question) => (
            <Text key={question} className="text-base leading-6 text-[#6f5a50]">
              • {question}
            </Text>
          ))}
          <Text className="font-semibold text-[#2f211c]">What I can work on</Text>
          {latest.ownerWorkOns.map((item) => (
            <Text key={item} className="text-base leading-6 text-[#6f5a50]">
              • {item}
            </Text>
          ))}
          <Text className="font-semibold text-[#2f211c]">What I may ask for</Text>
          {latest.partnerRequests.map((item) => (
            <Text key={item} className="text-base leading-6 text-[#6f5a50]">
              • {item}
            </Text>
          ))}
          <Pressable
            className="h-12 rounded-full bg-[#2f211c] items-center justify-center"
            disabled={isWorking || latest.status === "shared"}
            onPress={() => handleShare(latest._id)}
          >
            <Text className="font-semibold text-[#fff8f1]">
              {latest.status === "shared" ? "Shared" : "Share safe summary to chat"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View className="h-[420px] overflow-hidden rounded-3xl bg-white/85 border border-[#f1dfd2]">
        <View className="p-4 border-b border-[#f1dfd2]">
          <Text className="text-xl font-bold text-[#2f211c]">Couple review chat</Text>
          <Text className="text-sm text-[#6f5a50]">
            AI-mediated summaries appear here for both partners.
          </Text>
        </View>
        <GiftedChat
          messages={messages}
          user={{ _id: userId ?? "me" }}
          renderInputToolbar={() => null}
        />
      </View>

      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
    </ScrollView>
  );
}
