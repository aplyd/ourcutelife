import { useSession } from "@/lib/betterAuth";
import { useAppMutation, useAppQuery } from "@/lib/devMock";
import {
  beginQualityTimeResponse,
  cancelQualityTimeRequest,
  getQualityTimeRequest,
  type QualityTimeCategory,
  type QualityTimeRequestId,
  type QualityTimeResponderCard,
  recordQualityTimeResponderDecision,
} from "@/lib/qualityTimeApi";
import {
  deriveQualityTimeResponderProgress,
  isQualityTimeResponderWriteDisabled,
  qualityTimeResponderStaleVersionFromError,
  reconcileQualityTimeResponderStaleVersion,
} from "@/lib/qualityTimeResponderState";
import { Redirect, router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../../../convex/_generated/api";

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

function responderErrorMessage(error: unknown) {
  return qualityTimeResponderStaleVersionFromError(error, 0) === 0
    ? "This request changed. Waiting for the latest state."
    : "That update was not saved. Check the latest request state and try again.";
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

export function ErrorBoundary(_props: ErrorBoundaryProps): JSX.Element {
  return (
    <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
      <Text className="text-center text-4xl font-bold text-ink">Quality Time unavailable</Text>
      <Text className="text-center text-base leading-6 text-muted">
        This request cannot be shown right now.
      </Text>
      <BackToPlansButton />
    </View>
  );
}

export default function QualityTimeRespondScreen(): JSX.Element {
  const { requestId: requestIdParam } = useLocalSearchParams<{ requestId: string }>();
  const requestId = requestIdParam as QualityTimeRequestId | undefined;
  const betterAuthSession = useSession();
  const viewer = useAppQuery(api.auth.viewer, {});
  const request = useAppQuery(getQualityTimeRequest, requestId ? { requestId } : "skip");
  const beginResponse = useAppMutation(beginQualityTimeResponse);
  const recordDecision = useAppMutation(recordQualityTimeResponderDecision);
  const cancelRequest = useAppMutation(cancelQualityTimeRequest);
  const [selectedCategories, setSelectedCategories] = useState<QualityTimeCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<QualityTimeCategory | null>(null);
  const [isBeginning, setIsBeginning] = useState(false);
  const [isDecisionPending, setIsDecisionPending] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [staleVersion, setStaleVersion] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const responderRequest =
    request?.status === "responding" && "responderCategories" in request ? request : null;
  const progress = useMemo(
    () =>
      responderRequest
        ? deriveQualityTimeResponderProgress(
            responderRequest.responderCategories,
            responderRequest.categoryResults,
          )
        : null,
    [responderRequest],
  );
  const isAwaitingFreshProjection = isQualityTimeResponderWriteDisabled(
    false,
    staleVersion,
    request?.version,
  );
  const isDecisionDisabled =
    isDecisionPending || isCanceling || isBeginning || isAwaitingFreshProjection;
  const isCancelDisabled =
    isCanceling || isDecisionPending || isBeginning || isAwaitingFreshProjection;
  const canBegin =
    request?.status === "sent" &&
    selectedCategories.length > 0 &&
    !isBeginning &&
    !isCanceling &&
    !isAwaitingFreshProjection;

  useEffect(() => {
    const nextStaleVersion = reconcileQualityTimeResponderStaleVersion(
      staleVersion,
      request?.version,
    );
    if (nextStaleVersion !== staleVersion) {
      setStaleVersion(nextStaleVersion);
      setError(null);
    }
  }, [request?.version, staleVersion]);

  useEffect(() => {
    if (!responderRequest || !progress) {
      setActiveCategory(null);
      return;
    }
    const activeIsPending =
      activeCategory !== null &&
      !progress.resolvedCategories.includes(activeCategory) &&
      responderRequest.responderCategories.includes(activeCategory);
    if (!activeIsPending) setActiveCategory(progress.nextPendingCategory);
  }, [activeCategory, progress, responderRequest]);

  useEffect(() => {
    if (request?.status === "completed") {
      router.replace(`/plans/quality-time/${request.requestId}/outcome`);
    }
  }, [request]);

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

  function latchStaleProjection(submittedVersion: number, mutationError: unknown) {
    const failedVersion = qualityTimeResponderStaleVersionFromError(
      mutationError,
      submittedVersion,
    );
    if (failedVersion !== null) setStaleVersion(failedVersion);
  }

  function toggleCategory(category: QualityTimeCategory) {
    if (currentRequest.status !== "sent" || isBeginning) return;
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((selected) => selected !== category)
        : [...current, category],
    );
  }

  async function handleBegin() {
    if (currentRequest.status !== "sent" || !canBegin) return;
    setError(null);
    setIsBeginning(true);
    try {
      await beginResponse({
        requestId: currentRequest.requestId,
        expectedVersion: currentRequest.version,
        categories: selectedCategories,
      });
    } catch (err) {
      latchStaleProjection(currentRequest.version, err);
      setError(responderErrorMessage(err));
    } finally {
      setIsBeginning(false);
    }
  }

  async function handleDecision(card: QualityTimeResponderCard, decision: "pass" | "accept") {
    if (!responderRequest || isDecisionDisabled) return;
    setError(null);
    setIsDecisionPending(true);
    try {
      await recordDecision({
        requestId: currentRequest.requestId,
        expectedVersion: currentRequest.version,
        optionId: card.optionId,
        decision,
      });
    } catch (err) {
      latchStaleProjection(currentRequest.version, err);
      setError(responderErrorMessage(err));
    } finally {
      setIsDecisionPending(false);
    }
  }

  async function confirmCancel() {
    if (
      (currentRequest.status !== "sent" && currentRequest.status !== "responding") ||
      isCancelDisabled
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
      setError(responderErrorMessage(err));
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

  if (request.status === "completed") {
    return (
      <View className="flex-1 items-center justify-center bg-app-bg">
        <ActivityIndicator />
        <Text className="mt-3 text-muted">Opening your Quality Time…</Text>
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

  if (request.status === "sent") {
    return (
      <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="gap-6 px-4 pb-10 pt-16">
        <View className="gap-2">
          <Text className="text-4xl font-bold text-ink">Choose what sounds good now</Text>
          <Text className="text-base leading-6 text-muted">
            {formatTiming(request.timing)} · Pick at least one requested category.
          </Text>
        </View>
        <View className="gap-3">
          {request.selectedCategories.map((category) => (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${categoryLabels[category]} for this Quality Time`}
              accessibilityState={{ selected: selectedCategories.includes(category) }}
              className={`rounded-2xl px-5 py-4 ${selectedCategories.includes(category) ? "bg-accent" : "border border-soft bg-card"}`}
              onPress={() => toggleCategory(category)}
            >
              <Text
                className={
                  selectedCategories.includes(category)
                    ? "font-bold text-app-bg"
                    : "font-bold text-ink"
                }
              >
                {categoryLabels[category]}
              </Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start choosing together"
          accessibilityState={{ disabled: !canBegin, busy: isBeginning }}
          disabled={!canBegin}
          className={`h-14 items-center justify-center rounded-full ${canBegin ? "bg-ink" : "bg-soft"}`}
          onPress={handleBegin}
        >
          <Text className="font-bold text-app-bg">
            {isBeginning ? "Starting…" : "Start choosing together"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel Quality Time request"
          accessibilityState={{ disabled: isCancelDisabled, busy: isCanceling }}
          disabled={isCancelDisabled}
          className="h-12 items-center justify-center rounded-full border border-red-200 bg-card"
          onPress={requestCancel}
        >
          <Text className="font-bold text-red-700">
            {isCanceling ? "Canceling…" : "Cancel request"}
          </Text>
        </Pressable>
        <BackToPlansButton />
      </ScrollView>
    );
  }

  if (!responderRequest || !progress) {
    return (
      <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
        <Text className="text-center text-4xl font-bold text-ink">Quality Time unavailable</Text>
        <Text className="text-center text-base leading-6 text-muted">
          This request cannot be shown right now.
        </Text>
        <BackToPlansButton />
      </View>
    );
  }

  const activeResult = responderRequest.categoryResults.find(
    (result) => result.category === activeCategory,
  );
  const card = activeResult?.status === "pending" ? activeResult.options[0] : undefined;

  return (
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="gap-5 px-4 pb-10 pt-16">
      <View className="gap-2">
        <Text className="text-4xl font-bold text-ink">Choose together</Text>
        <Text className="text-base leading-6 text-muted">
          Choose privately from the options available for this request.
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {responderRequest.responderCategories.map((category) => {
          const result = responderRequest.categoryResults.find(
            (item) => item.category === category,
          );
          const resolved = progress.resolvedCategories.includes(category);
          return (
            <Pressable
              key={category}
              accessibilityRole="button"
              accessibilityLabel={`Choose ${categoryLabels[category]} choices`}
              accessibilityState={{ selected: activeCategory === category, disabled: resolved }}
              disabled={resolved}
              className={`rounded-full px-4 py-3 ${activeCategory === category ? "bg-accent" : "border border-soft bg-card"}`}
              onPress={() => setActiveCategory(category)}
            >
              <Text
                className={
                  activeCategory === category ? "font-bold text-app-bg" : "font-bold text-ink"
                }
              >
                {categoryLabels[category]}
                {result?.status === "matched"
                  ? " · Shared option found"
                  : resolved
                    ? " · Finished"
                    : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {activeResult?.status === "matched" ? (
        <View className="rounded-3xl border border-soft bg-card p-5">
          <Text className="text-lg font-bold text-ink">Shared option found — moving on</Text>
        </View>
      ) : activeResult?.status === "pending" && activeResult.options.length === 0 ? (
        <View className="rounded-3xl border border-soft bg-card p-5">
          <Text className="text-lg font-bold text-ink">
            No shared option in {categoryLabels[activeResult.category]} this time
          </Text>
        </View>
      ) : card ? (
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
                disabled: isDecisionDisabled,
                busy: isDecisionPending,
              }}
              disabled={isDecisionDisabled}
              className="h-13 flex-1 items-center justify-center rounded-full border border-soft bg-app-bg"
              onPress={() => void handleDecision(card, "pass")}
            >
              <Text className="font-bold text-ink">Pass</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Accept ${card.title}`}
              accessibilityState={{
                disabled: isDecisionDisabled,
                busy: isDecisionPending,
              }}
              disabled={isDecisionDisabled}
              className="h-13 flex-1 items-center justify-center rounded-full bg-accent"
              onPress={() => void handleDecision(card, "accept")}
            >
              <Text className="font-bold text-app-bg">Accept</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="items-center rounded-3xl border border-soft bg-card p-8">
          <ActivityIndicator />
          <Text className="mt-3 text-muted">Waiting for the latest request state…</Text>
        </View>
      )}

      {isAwaitingFreshProjection ? (
        <Text className="text-center text-sm text-red-700">
          This request changed. Waiting for the latest state.
        </Text>
      ) : error ? (
        <Text className="text-center text-sm text-red-700">{error}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel Quality Time request"
        accessibilityState={{ disabled: isCancelDisabled, busy: isCanceling }}
        disabled={isCancelDisabled}
        className="h-12 items-center justify-center rounded-full border border-red-200 bg-card"
        onPress={requestCancel}
      >
        <Text className="font-bold text-red-700">
          {isCanceling ? "Canceling…" : "Cancel request"}
        </Text>
      </Pressable>
      <BackToPlansButton />
    </ScrollView>
  );
}
