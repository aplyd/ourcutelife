import { useAction, useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

const offscreen = 900;

function badgeForIdea(idea: {
  category: string;
  kind?: string | null;
  subcategories?: string[] | null;
}) {
  const primary = idea.subcategories?.[0]?.replace(/_/g, " ") ?? idea.category;
  return `${primary}${idea.kind === "place" ? " nearby" : ""}`;
}

function photoForIdea(idea: { title: string; category: string; photoUrl?: string | null }) {
  if (idea.photoUrl) return idea.photoUrl;
  const query = encodeURIComponent(`${idea.title} ${idea.category} date night`);
  return `https://source.unsplash.com/1200x1800/?${query}`;
}

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
  const insets = useSafeAreaInsets();

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
    if (!viewer?.couple || ideas === undefined || hasTriedAutoDiscovery || ideas.length > 0) return;
    setHasTriedAutoDiscovery(true);
    void runDiscovery(false);
  }, [hasTriedAutoDiscovery, ideas, runDiscovery, viewer?.couple]);

  useEffect(() => {
    if ((ideas?.length ?? 0) > 0) setHasTriedAutoDiscovery(false);
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
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      <View className="flex-1">
        {nextIdeas.map((idea, index) => (
          <View
            key={idea._id}
            className="absolute inset-0 overflow-hidden bg-card/90"
            style={{ transform: [{ scale: 0.95 - index * 0.04 }, { translateY: 14 + index * 16 }] }}
          />
        ))}
        {currentIdea ? (
          <GestureDetector gesture={gesture}>
            <Animated.View
              className="absolute inset-0 overflow-hidden bg-card justify-between"
              style={cardStyle}
            >
              <Image
                resizeMode="cover"
                source={{ uri: photoForIdea(currentIdea) }}
                style={{ bottom: 0, left: 0, position: "absolute", right: 0, top: 0 }}
              />
              <View className="absolute inset-0 bg-black/20" />
              <View className="px-4 gap-3" style={{ paddingTop: Math.max(insets.top + 78, 112) }}>
                <Text className="self-start overflow-hidden rounded-full bg-white/85 px-3 py-2 text-xs font-bold uppercase tracking-widest text-[#5b21b6]">
                  {badgeForIdea(currentIdea)}
                </Text>
              </View>
              <View
                className="p-4 gap-3 bg-black/40"
                style={{ paddingBottom: Math.max(insets.bottom + 94, 112) }}
              >
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
      <MeHeaderButton />
    </View>
  );
}
