import { useAction, useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import * as Location from "expo-location";
import type { JSX } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MeHeaderButton } from "@/components/MeHeaderButton";
import { useSession } from "@/lib/betterAuth";

const refillThreshold = 4;
const offscreen = 900;

export default function SwipeTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const ideas = useQuery(api.plans.list, {});
  const seed = useMutation(api.plans.seed);
  const vote = useMutation(api.plans.vote);
  const discoverNearby = useAction(api.discovery.discoverNearby);
  const [isWorking, setIsWorking] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [hasTriedAutoDiscovery, setHasTriedAutoDiscovery] = useState(false);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (betterAuthSession.data?.session && viewer?.couple) void seed({});
  }, [betterAuthSession.data?.session, seed, viewer?.couple]);

  const currentIdea = ideas?.[0];
  const nextIdeas = useMemo(() => ideas?.slice(1, 3) ?? [], [ideas]);

  const runDiscovery = useCallback(
    async (showAlert: boolean) => {
      if (isDiscovering) return;
      setIsDiscovering(true);
      try {
        const existingPermission = await Location.getForegroundPermissionsAsync();
        const permission =
          existingPermission.status === "granted"
            ? existingPermission
            : await Location.requestForegroundPermissionsAsync();
        if (permission.status !== "granted") {
          if (showAlert)
            Alert.alert(
              "Location needed",
              "Enable location to automatically find nearby food, drinks, entertainment, and activities.",
            );
          return;
        }
        const position = await Location.getCurrentPositionAsync({});
        const result = await discoverNearby({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          categories: ["food", "drinks", "entertainment", "activity"],
          radiusMeters: 3500,
        });
        if (showAlert)
          Alert.alert(
            "Nearby ideas added",
            `Found ${result.found}. Added ${result.inserted} new swipe cards.`,
          );
      } catch (err) {
        if (showAlert)
          Alert.alert(
            "Discovery failed",
            err instanceof Error ? err.message : "Could not find nearby ideas.",
          );
      } finally {
        setIsDiscovering(false);
      }
    },
    [discoverNearby, isDiscovering],
  );

  useEffect(() => {
    if (
      !viewer?.couple ||
      ideas === undefined ||
      hasTriedAutoDiscovery ||
      ideas.length > refillThreshold
    )
      return;
    setHasTriedAutoDiscovery(true);
    void runDiscovery(false);
  }, [hasTriedAutoDiscovery, ideas, runDiscovery, viewer?.couple]);

  useEffect(() => {
    if ((ideas?.length ?? 0) > refillThreshold) setHasTriedAutoDiscovery(false);
  }, [ideas?.length]);

  async function handleVote(ideaId: Id<"planIdeas">, nextVote: "like" | "pass") {
    setIsWorking(true);
    try {
      await vote({ ideaId, vote: nextVote });
    } finally {
      setIsWorking(false);
      translateX.value = 0;
      translateY.value = 0;
    }
  }

  function commitSwipe(direction: "like" | "pass") {
    if (!currentIdea || isWorking) return;
    translateX.value = withTiming(direction === "like" ? offscreen : -offscreen, { duration: 180 });
    void handleVote(currentIdea._id, direction);
  }

  const gesture = Gesture.Pan()
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const threshold = width * 0.26;
      if (event.translationX > threshold) runOnJS(commitSwipe)("like");
      else if (event.translationX < -threshold) runOnJS(commitSwipe)("pass");
      else {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
      }
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${interpolate(translateX.value, [-width, 0, width], [-16, 0, 16])}deg` },
    ],
  }));

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || ideas === undefined)
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  return (
    <View className="flex-1 bg-app-bg px-3 pt-14 pb-24 gap-3">
      <MeHeaderButton />
      <View className="pr-20">
        <Text className="text-sm font-semibold uppercase tracking-widest text-muted">Swipe</Text>
        <Text className="text-3xl font-bold text-ink">Private yes/no pile</Text>
        <Text className="text-sm leading-5 text-muted">
          {isDiscovering ? "Finding more nearby cards…" : `${ideas?.length ?? 0} options left`}
        </Text>
      </View>

      <View className="flex-1">
        {nextIdeas.map((idea, index) => (
          <View
            key={idea._id}
            className="absolute inset-0 overflow-hidden rounded-[36px] border border-soft bg-card/90"
            style={{ transform: [{ scale: 0.95 - index * 0.04 }, { translateY: 14 + index * 16 }] }}
          />
        ))}
        {currentIdea ? (
          <GestureDetector gesture={gesture}>
            <Animated.View
              className="absolute inset-0 overflow-hidden rounded-[36px] border border-soft bg-card justify-between"
              style={cardStyle}
            >
              {currentIdea.photoUrl ? (
                <Image
                  source={{ uri: currentIdea.photoUrl }}
                  className="absolute inset-0 h-full w-full"
                />
              ) : null}
              <View className="absolute inset-0 bg-black/20" />
              <View className="p-4 gap-3">
                <Text className="self-start overflow-hidden rounded-full bg-white/85 px-3 py-2 text-xs font-bold uppercase tracking-widest text-[#5b21b6]">
                  {currentIdea.category}
                </Text>
              </View>
              <View className="p-4 gap-3 bg-black/35">
                <Text className="text-4xl font-bold leading-[44px] text-white">
                  {currentIdea.title}
                </Text>
                <Text className="text-base leading-6 text-white/90">{currentIdea.description}</Text>
                {currentIdea.address ? (
                  <Text className="text-sm leading-5 text-white/80">{currentIdea.address}</Text>
                ) : null}
                <View className="flex-row flex-wrap gap-2">
                  {(currentIdea.subcategories ?? currentIdea.vibeTags ?? []).map((tag: string) => (
                    <Text
                      key={tag}
                      className="overflow-hidden rounded-full bg-white/20 px-3 py-2 text-sm font-semibold text-white"
                    >
                      #{tag}
                    </Text>
                  ))}
                </View>
                <View className="flex-row gap-3 pt-2">
                  <Pressable
                    className="flex-1 h-14 rounded-full bg-white/85 items-center justify-center"
                    disabled={isWorking}
                    onPress={() => commitSwipe("pass")}
                  >
                    <Text className="text-lg font-bold text-[#6f5a50]">Pass</Text>
                  </Pressable>
                  <Pressable
                    className="flex-1 h-14 rounded-full bg-accent items-center justify-center"
                    disabled={isWorking}
                    onPress={() => commitSwipe("like")}
                  >
                    <Text className="text-lg font-bold text-white">Like</Text>
                  </Pressable>
                </View>
              </View>
            </Animated.View>
          </GestureDetector>
        ) : (
          <View className="absolute inset-0 rounded-[36px] bg-card border border-soft items-center justify-center gap-3 p-4">
            <Text className="text-3xl font-bold text-center text-ink">No more cards</Text>
            <Text className="text-base leading-6 text-center text-muted">
              {isDiscovering
                ? "Scraping more nearby ideas…"
                : "Add a private suggestion or try discovery."}
            </Text>
            <Pressable
              className="h-12 rounded-full bg-accent px-5 items-center justify-center"
              disabled={isDiscovering}
              onPress={() => void runDiscovery(true)}
            >
              <Text className="font-bold text-white">
                {isDiscovering ? "Finding nearby…" : "Find nearby ideas"}
              </Text>
            </Pressable>
            <Pressable
              className="h-12 rounded-full bg-ink px-5 items-center justify-center"
              onPress={() => router.push("/plans/new")}
            >
              <Text className="font-bold text-app-bg">Add plan item</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}
