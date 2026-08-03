import { useSession } from "@/lib/betterAuth";
import { useAppMutation, useAppQuery } from "@/lib/devMock";
import {
  cancelQualityTimeRequest,
  getQualityTimeRequest,
  listQualityTimeDraftInventory,
  type QualityTimeCard,
  type QualityTimeCategory,
  type QualityTimeRequestId,
  recordQualityTimeDecision,
  sendQualityTimeRequest,
} from "@/lib/qualityTimeApi";
import {
  exhaustedQualityTimeInventoryCopy,
  isQualityTimeWriteDisabled,
  isStaleQualityTimeMutationError,
  qualityTimeStaleVersionFromError,
  reconcileQualityTimeStaleVersion,
} from "@/lib/qualityTimeInitiatorState";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../../convex/_generated/api";

const categoryLabels: Record<QualityTimeCategory, string> = {
  eat: "Eat",
  drink: "Drink",
  explore_adventure: "Explore/Adventure",
  entertainment: "Entertainment",
  romance: "Romance",
};

function formatTiming(timing: { kind: "now" } | { kind: "future"; scheduledFor: number }) {
  return timing.kind === "now"
    ? "Now"
    : new Date(timing.scheduledFor).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatCost(costLevel: number) {
  if (costLevel <= 0) return "Free";
  return "$".repeat(Math.min(3, Math.max(1, Math.round(costLevel))));
}

function mutationErrorMessage(error: unknown) {
  if (isStaleQualityTimeMutationError(error))
    return "This request changed. Waiting for the latest server state before retrying.";
  return "That update was not saved. Check the latest request state and try again.";
}

function BackToPlansButton(): JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back to Plans"
      className="h-11 items-center justify-center rounded-full border border-soft bg-card px-4"
      onPress={() => router.replace("/plans")}
    >
      <Text className="font-bold text-ink">Back to Plans</Text>
    </Pressable>
  );
}

export default function QualityTimeRequestScreen(): JSX.Element {
  const { requestId: requestIdParam } = useLocalSearchParams<{ requestId: string }>();
  const requestId = requestIdParam as QualityTimeRequestId | undefined;
  const betterAuthSession = useSession();
  const viewer = useAppQuery(api.auth.viewer, {});
  const request = useAppQuery(getQualityTimeRequest, requestId ? { requestId } : "skip");
  const recordDecision = useAppMutation(recordQualityTimeDecision);
  const sendRequest = useAppMutation(sendQualityTimeRequest);
  const cancelRequest = useAppMutation(cancelQualityTimeRequest);
  const [activeCategory, setActiveCategory] = useState<QualityTimeCategory | null>(null);
  const [inventoryCursor, setInventoryCursor] = useState<string | null>(null);
  const [isDecisionPending, setIsDecisionPending] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [staleVersion, setStaleVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAwaitingFreshProjection = isQualityTimeWriteDisabled(
    false,
    staleVersion,
    request?.version,
  );

  const activeCount =
    request?.status === "draft" && activeCategory
      ? request.shortlistCounts.find((count) => count.category === activeCategory)
      : undefined;
  const exhaustedInventoryCopy = exhaustedQualityTimeInventoryCopy(activeCount?.acceptedCount ?? 0);
  const shouldLoadInventory =
    request?.status === "draft" &&
    activeCategory !== null &&
    activeCount !== undefined &&
    activeCount.acceptedCount < 5;
  const inventory = useAppQuery(
    listQualityTimeDraftInventory,
    shouldLoadInventory
      ? {
          requestId: request.requestId,
          category: activeCategory,
          paginationOpts: { numItems: 12, cursor: inventoryCursor },
        }
      : "skip",
  );

  useEffect(() => {
    if (request?.status !== "draft") return;
    if (!activeCategory || !request.selectedCategories.includes(activeCategory)) {
      setActiveCategory(request.selectedCategories[0] ?? null);
      setInventoryCursor(null);
    }
  }, [activeCategory, request]);

  useEffect(() => {
    setInventoryCursor(null);
  }, [activeCategory]);

  useEffect(() => {
    if (inventory && inventory.page.length === 0 && !inventory.isDone) {
      setInventoryCursor(inventory.continueCursor);
    }
  }, [inventory]);

  useEffect(() => {
    const nextStaleVersion = reconcileQualityTimeStaleVersion(staleVersion, request?.version);
    if (nextStaleVersion !== staleVersion) {
      setStaleVersion(nextStaleVersion);
      setError(null);
    }
  }, [request, staleVersion]);

  function latchStaleProjection(submittedVersion: number, mutationError: unknown) {
    const failedVersion = qualityTimeStaleVersionFromError(mutationError, submittedVersion);
    if (failedVersion !== null) setStaleVersion(failedVersion);
  }

  const canSend = useMemo(
    () =>
      request?.status === "draft" &&
      request.shortlistCounts.length === request.selectedCategories.length &&
      request.shortlistCounts.every(
        (count) => count.acceptedCount >= 3 && count.acceptedCount <= 5,
      ) &&
      !isAwaitingFreshProjection &&
      !isDecisionPending &&
      !isSending &&
      !isCanceling,
    [isAwaitingFreshProjection, isCanceling, isDecisionPending, isSending, request],
  );

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (!requestId) return <Redirect href="/plans" />;
  if (viewer === undefined || request === undefined) {
    return (
      <View className="flex-1 items-center justify-center bg-app-bg">
        <ActivityIndicator />
        <Text className="mt-3 text-muted">Loading Quality Time…</Text>
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;
  const currentRequest = request;

  async function handleDecision(card: QualityTimeCard, decision: "pass" | "accept") {
    if (currentRequest.status !== "draft" || isDecisionPending || isAwaitingFreshProjection) return;
    setError(null);
    setIsDecisionPending(true);
    try {
      await recordDecision({
        requestId: currentRequest.requestId,
        expectedVersion: currentRequest.version,
        planIdeaId: card.planIdeaId,
        decision,
      });
      setInventoryCursor(null);
    } catch (err) {
      latchStaleProjection(currentRequest.version, err);
      setError(mutationErrorMessage(err));
    } finally {
      setIsDecisionPending(false);
    }
  }

  async function handleSend() {
    if (currentRequest.status !== "draft" || !canSend) return;
    setError(null);
    setIsSending(true);
    try {
      await sendRequest({
        requestId: currentRequest.requestId,
        expectedVersion: currentRequest.version,
      });
    } catch (err) {
      latchStaleProjection(currentRequest.version, err);
      setError(mutationErrorMessage(err));
    } finally {
      setIsSending(false);
    }
  }

  async function confirmCancel() {
    if (
      (currentRequest.status !== "draft" && currentRequest.status !== "sent") ||
      isCanceling ||
      isAwaitingFreshProjection
    )
      return;
    setError(null);
    setIsCanceling(true);
    try {
      await cancelRequest({
        requestId: currentRequest.requestId,
        expectedVersion: currentRequest.version,
      });
    } catch (err) {
      latchStaleProjection(currentRequest.version, err);
      setError(mutationErrorMessage(err));
    } finally {
      setIsCanceling(false);
    }
  }

  function requestCancel() {
    Alert.alert("Cancel Quality Time request?", "This ends the request without sharing choices.", [
      { text: "Keep request", style: "cancel" },
      { text: "Cancel request", style: "destructive", onPress: () => void confirmCancel() },
    ]);
  }

  const card = inventory?.page[0];

  if (request.status === "sent" || request.status === "responding") {
    return (
      <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
        <Text className="text-center text-4xl font-bold text-ink">Waiting for your partner</Text>
        <Text className="text-center text-base leading-6 text-muted">
          Your private shortlist is saved. You can leave this screen and come back later.
        </Text>
        {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
        {request.status === "sent" ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel Quality Time request"
            accessibilityState={{
              disabled: isCanceling || isAwaitingFreshProjection,
              busy: isCanceling,
            }}
            disabled={isCanceling || isAwaitingFreshProjection}
            className="h-12 items-center justify-center rounded-full border border-red-200 bg-card"
            onPress={requestCancel}
          >
            <Text className="font-bold text-red-700">
              {isCanceling ? "Canceling…" : "Cancel request"}
            </Text>
          </Pressable>
        ) : null}
        <BackToPlansButton />
      </View>
    );
  }

  if (request.status === "canceled" || request.status === "expired") {
    return (
      <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
        <Text className="text-center text-4xl font-bold text-ink">
          {request.status === "canceled"
            ? "Quality Time request canceled"
            : "Quality Time request expired"}
        </Text>
        <Text className="text-center text-base leading-6 text-muted">
          Nothing else was shared. Start again whenever the timing feels right.
        </Text>
        <BackToPlansButton />
      </View>
    );
  }

  if (request.status === "completed") {
    return (
      <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
        <Text className="text-center text-4xl font-bold text-ink">Quality Time is ready</Text>
        <Text className="text-center text-base leading-6 text-muted">
          Your shared result is ready.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View Quality Time outcome"
          className="h-12 items-center justify-center rounded-full bg-ink"
          onPress={() => router.replace(`/plans/quality-time/${request.requestId}/outcome`)}
        >
          <Text className="font-bold text-app-bg">View Quality Time outcome</Text>
        </Pressable>
        <BackToPlansButton />
      </View>
    );
  }

  if (request.status !== "draft") {
    return (
      <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
        <Text className="text-center text-4xl font-bold text-ink">Quality Time updated</Text>
        <Text className="text-center text-base text-muted">
          Return to Plans and open the request again.
        </Text>
        <BackToPlansButton />
      </View>
    );
  }
  const draftRequest = request;
  const shortlistCounts = draftRequest.shortlistCounts;

  return (
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="gap-5 px-3 pb-10 pt-16">
      <View className="flex-row items-center justify-between gap-3">
        <BackToPlansButton />
        <Text className="text-lg font-bold text-ink">Quality Time</Text>
      </View>

      <View className="gap-2">
        <Text className="text-4xl font-bold text-ink">Build your private shortlist</Text>
        <Text className="text-base leading-6 text-muted">
          {formatTiming(request.timing)} · Choose 3–5 options in every category.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {request.selectedCategories.map((category) => {
          const count = shortlistCounts.find((item) => item.category === category);
          return (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${categoryLabels[category]}`}
              accessibilityState={{ selected: activeCategory === category }}
              className={`rounded-full px-4 py-3 ${activeCategory === category ? "bg-accent" : "border border-soft bg-card"}`}
              onPress={() => setActiveCategory(category)}
            >
              <Text
                className={
                  activeCategory === category ? "font-bold text-app-bg" : "font-bold text-ink"
                }
              >
                {categoryLabels[category]} {count?.acceptedCount ?? 0}/3
              </Text>
            </Pressable>
          );
        })}
      </View>

      {card ? (
        <View className="gap-4 rounded-[28px] border border-soft bg-card p-5">
          {card.photoUrl ? (
            <Image
              accessibilityLabel={`${card.title} photo`}
              className="h-44 w-full rounded-2xl"
              source={{ uri: card.photoUrl }}
            />
          ) : null}
          <View className="gap-2">
            <Text className="text-2xl font-bold text-ink">{card.title}</Text>
            <Text className="text-base leading-6 text-muted">{card.description}</Text>
            <Text className="text-sm text-muted">
              {card.kind} · {formatCost(card.costLevel)} · {card.durationMinutes} min
            </Text>
            {card.address ? <Text className="text-sm text-muted">{card.address}</Text> : null}
            {card.vibeTags.length ? (
              <Text className="text-sm text-muted">{card.vibeTags.join(" · ")}</Text>
            ) : null}
          </View>
          <View className="flex-row gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Pass ${card.title}`}
              accessibilityState={{
                disabled: isDecisionPending || isAwaitingFreshProjection,
                busy: isDecisionPending,
              }}
              disabled={isDecisionPending || isAwaitingFreshProjection}
              className="h-13 flex-1 items-center justify-center rounded-full border border-soft bg-app-bg"
              onPress={() => void handleDecision(card, "pass")}
            >
              <Text className="font-bold text-ink">Pass</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Accept ${card.title}`}
              accessibilityState={{
                disabled: isDecisionPending || isAwaitingFreshProjection,
                busy: isDecisionPending,
              }}
              disabled={isDecisionPending || isAwaitingFreshProjection}
              className="h-13 flex-1 items-center justify-center rounded-full bg-accent"
              onPress={() => void handleDecision(card, "accept")}
            >
              <Text className="font-bold text-app-bg">Accept</Text>
            </Pressable>
          </View>
        </View>
      ) : activeCount?.acceptedCount === 5 ? (
        <View className="rounded-3xl border border-soft bg-card p-5">
          <Text className="text-lg font-bold text-ink">This category has 5 options</Text>
          <Text className="mt-2 text-muted">
            Its shortlist is full. Continue with another category or send.
          </Text>
        </View>
      ) : inventory === undefined ? (
        <View className="items-center rounded-3xl border border-soft bg-card p-8">
          <ActivityIndicator />
          <Text className="mt-3 text-muted">Finding options…</Text>
        </View>
      ) : inventory.isDone ? (
        <View className="rounded-3xl border border-soft bg-card p-5">
          <Text className="text-lg font-bold text-ink">{exhaustedInventoryCopy.title}</Text>
          <Text className="mt-2 leading-6 text-muted">{exhaustedInventoryCopy.body}</Text>
        </View>
      ) : (
        <View className="items-center rounded-3xl border border-soft bg-card p-8">
          <ActivityIndicator />
          <Text className="mt-3 text-muted">Looking for more options…</Text>
        </View>
      )}

      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send Quality Time request"
        accessibilityState={{ disabled: !canSend, busy: isSending }}
        disabled={!canSend}
        className={`h-14 items-center justify-center rounded-full ${canSend ? "bg-ink" : "bg-soft"}`}
        onPress={handleSend}
      >
        <Text className="font-bold text-app-bg">
          {isSending ? "Sending…" : "Send Quality Time request"}
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel Quality Time request"
        accessibilityState={{
          disabled: isCanceling || isAwaitingFreshProjection,
          busy: isCanceling,
        }}
        disabled={isCanceling || isAwaitingFreshProjection}
        className="h-12 items-center justify-center rounded-full border border-red-200 bg-card"
        onPress={requestCancel}
      >
        <Text className="font-bold text-red-700">
          {isCanceling ? "Canceling…" : "Cancel request"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
