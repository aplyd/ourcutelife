import { useAction, useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import * as Location from "expo-location";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MeHeaderButton } from "@/components/MeHeaderButton";
import { useSession } from "@/lib/betterAuth";

export default function SwipeTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const ideas = useQuery(api.plans.list, {});
  const seed = useMutation(api.plans.seed);
  const vote = useMutation(api.plans.vote);
  const discoverNearby = useAction(api.discovery.discoverNearby);
  const [isWorking, setIsWorking] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);

  useEffect(() => {
    if (betterAuthSession.data?.session && viewer?.couple) void seed({});
  }, [betterAuthSession.data?.session, seed, viewer?.couple]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || ideas === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  const currentIdea = ideas[0];

  async function handleVote(ideaId: Id<"planIdeas">, nextVote: "like" | "pass") {
    setIsWorking(true);
    try {
      await vote({ ideaId, vote: nextVote });
    } finally {
      setIsWorking(false);
    }
  }

  async function handleDiscoverNearby() {
    setIsDiscovering(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          "Location needed",
          "Enable location to find nearby food, drinks, entertainment, and activities.",
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const result = await discoverNearby({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        categories: ["food", "drinks", "entertainment", "activity"],
        radiusMeters: 3000,
      });
      Alert.alert(
        "Nearby ideas added",
        `Found ${result.found}. Added ${result.inserted} new swipe cards.`,
      );
    } catch (err) {
      Alert.alert(
        "Discovery failed",
        err instanceof Error ? err.message : "Could not find nearby ideas.",
      );
    } finally {
      setIsDiscovering(false);
    }
  }

  return (
    <View className="flex-1 bg-[#fff8f1] px-6 pt-16 pb-28 gap-6">
      <MeHeaderButton />
      <View className="gap-2 pr-20">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Swipe
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Private yes/no pile</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          All plan ideas in random order. Your suggestion stays anonymous unless it matches.
        </Text>
        <Pressable
          className="self-start rounded-full bg-[#2f211c] px-4 py-2"
          disabled={isDiscovering}
          onPress={handleDiscoverNearby}
        >
          <Text className="font-bold text-white">
            {isDiscovering ? "Finding nearby…" : "Add nearby ideas"}
          </Text>
        </Pressable>
      </View>

      {currentIdea ? (
        <View className="flex-1 rounded-[40px] bg-white/95 p-7 border border-[#f1dfd2] justify-between">
          <View className="gap-5">
            <Text className="self-start rounded-full bg-[#f4ecff] px-4 py-2 text-sm font-bold uppercase tracking-widest text-[#5b21b6]">
              {currentIdea.category}
            </Text>
            <Text className="text-4xl font-bold leading-[46px] text-[#2f211c]">
              {currentIdea.title}
            </Text>
            <Text className="text-lg leading-7 text-[#6f5a50]">{currentIdea.description}</Text>
            {currentIdea.address ? (
              <Text className="text-sm leading-5 text-[#8c766b]">{currentIdea.address}</Text>
            ) : null}
            <View className="flex-row flex-wrap gap-2">
              {(currentIdea.subcategories ?? currentIdea.vibeTags ?? []).map((tag: string) => (
                <Text
                  key={tag}
                  className="rounded-full bg-[#fff8f1] px-3 py-2 text-sm font-semibold text-[#6f5a50]"
                >
                  #{tag}
                </Text>
              ))}
            </View>
          </View>
          <View className="flex-row gap-3">
            <Pressable
              className="flex-1 h-16 rounded-full bg-[#f1dfd2] items-center justify-center"
              disabled={isWorking}
              onPress={() => handleVote(currentIdea._id, "pass")}
            >
              <Text className="text-lg font-bold text-[#6f5a50]">Pass</Text>
            </Pressable>
            <Pressable
              className="flex-1 h-16 rounded-full bg-[#7c3aed] items-center justify-center"
              disabled={isWorking}
              onPress={() => handleVote(currentIdea._id, "like")}
            >
              <Text className="text-lg font-bold text-white">Like</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View className="flex-1 rounded-[40px] bg-white/95 p-7 border border-[#f1dfd2] items-center justify-center gap-3">
          <Text className="text-3xl font-bold text-center text-[#2f211c]">No more cards</Text>
          <Text className="text-base leading-6 text-center text-[#6f5a50]">
            Add a private suggestion or check back later.
          </Text>
          <Pressable
            className="h-12 rounded-full bg-[#7c3aed] px-5 items-center justify-center"
            onPress={() => router.push("/plans/new")}
          >
            <Text className="font-bold text-white">Add plan item</Text>
          </Pressable>
        </View>
      )}

      <Pressable
        className="absolute bottom-28 right-6 h-16 w-16 rounded-full bg-[#7c3aed] items-center justify-center shadow-lg"
        onPress={() => router.push("/plans/new")}
      >
        <Text className="text-4xl leading-none text-white">＋</Text>
      </Pressable>
    </View>
  );
}
