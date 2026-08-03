import { useSession } from "@/lib/betterAuth";
import { useAppQuery } from "@/lib/devMock";
import {
  getQualityTimeRequest,
  type QualityTimeRequestId,
  type QualityTimeResponderCard,
} from "@/lib/qualityTimeApi";
import { buildQualityTimeOutcomeSummary } from "@/lib/qualityTimeResponderState";
import { Redirect, router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import type { JSX } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";

import { api } from "../../../../../convex/_generated/api";

function formatCost(costLevel: number) {
  if (costLevel <= 0) return "Free";
  return "$".repeat(Math.min(3, Math.max(1, Math.round(costLevel))));
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
        This result cannot be shown right now.
      </Text>
      <BackToPlansButton />
    </View>
  );
}

function MutualOptionCard({
  card,
  accessibilityLabel,
}: {
  card: QualityTimeResponderCard;
  accessibilityLabel: string;
}): JSX.Element {
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="gap-3 rounded-[28px] border border-soft bg-card p-5"
    >
      {card.photoUrl ? (
        <Image
          accessibilityLabel={`${card.title} photo`}
          className="h-44 w-full rounded-2xl"
          source={{ uri: card.photoUrl }}
        />
      ) : null}
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
  );
}

export default function QualityTimeOutcomeScreen(): JSX.Element {
  const { requestId: requestIdParam } = useLocalSearchParams<{ requestId: string }>();
  const requestId = requestIdParam as QualityTimeRequestId | undefined;
  const betterAuthSession = useSession();
  const viewer = useAppQuery(api.auth.viewer, {});
  const request = useAppQuery(getQualityTimeRequest, requestId ? { requestId } : "skip");

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

  if (request.status === "completed") {
    const summary = buildQualityTimeOutcomeSummary(
      request.selectedCategories,
      request.categoryResults,
    );
    if (!summary) {
      return (
        <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
          <Text className="text-center text-4xl font-bold text-ink">Quality Time unavailable</Text>
          <Text className="text-center text-base leading-6 text-muted">
            This result cannot be shown right now.
          </Text>
          <BackToPlansButton />
        </View>
      );
    }
    const hasMatch = summary.results.some((result) => result.status === "matched");

    return (
      <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="gap-5 px-4 pb-10 pt-16">
        <View className="gap-3">
          <Text className="text-4xl font-bold text-ink">Your Quality Time is ready</Text>
          {hasMatch ? (
            <Text
              accessibilityLabel={summary.accessibleSummary}
              className="text-base leading-6 text-muted"
            >
              You found something that sounds good together.
            </Text>
          ) : (
            <>
              <Text className="text-xl font-bold text-ink">No shared option this time</Text>
              <Text className="text-base leading-6 text-muted">
                No pressure—come back whenever trying again feels right.
              </Text>
            </>
          )}
        </View>

        {summary.results.map((result) =>
          result.status === "matched" ? (
            <MutualOptionCard
              key={result.category}
              accessibilityLabel={result.accessibilityLabel}
              card={result.option}
            />
          ) : (
            <View
              key={result.category}
              accessible
              accessibilityLabel={result.accessibilityLabel}
              className="rounded-3xl border border-soft bg-card p-5"
            >
              <Text className="text-lg font-bold text-ink">{result.accessibilityLabel}</Text>
            </View>
          ),
        )}
        <BackToPlansButton />
      </ScrollView>
    );
  }

  if (request.status === "sent" || request.status === "responding") {
    const responderInProgress = request.status === "responding" && "responderCategories" in request;
    const initiatorInProgress =
      request.status === "responding" && !("responderCategories" in request);
    return (
      <View className="flex-1 justify-center gap-5 bg-app-bg px-5">
        <Text className="text-center text-4xl font-bold text-ink">
          Quality Time is still in progress
        </Text>
        {responderInProgress || initiatorInProgress ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Return to Quality Time request"
            className="h-12 items-center justify-center rounded-full bg-ink"
            onPress={() => {
              if (responderInProgress) {
                router.replace(`/plans/quality-time/${request.requestId}/respond`);
              } else {
                router.replace(`/plans/quality-time/${request.requestId}`);
              }
            }}
          >
            <Text className="font-bold text-app-bg">Return to request</Text>
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
