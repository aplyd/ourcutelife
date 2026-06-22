import { useQuery } from "convex/react";
import { router } from "expo-router";
import type { JSX } from "react";
import { Image, Pressable, Text, View } from "react-native";

import { api } from "../../convex/_generated/api";

function initial(value: string | null | undefined, fallback: string): string {
  return (value || fallback).slice(0, 1).toUpperCase();
}

export function MeHeaderButton(): JSX.Element {
  const viewer = useQuery(api.auth.viewer, {});
  const user = viewer?.user;
  const partner = viewer?.partner;

  return (
    <Pressable className="absolute right-6 top-14 z-20" onPress={() => router.push("/me")}>
      <View className="flex-row w-16">
        <View className="h-11 w-11 overflow-hidden rounded-full bg-accent border-2 border-card items-center justify-center">
          {user?.avatarUrl ? (
            <Image source={{ uri: user.avatarUrl }} className="h-11 w-11" />
          ) : (
            <Text className="font-bold text-white">
              {initial(user?.fullName ?? user?.email, "You")}
            </Text>
          )}
        </View>
        <View className="h-11 w-11 -ml-5 overflow-hidden rounded-full bg-[#f97316] border-2 border-card items-center justify-center">
          {partner?.avatarUrl ? (
            <Image source={{ uri: partner.avatarUrl }} className="h-11 w-11" />
          ) : (
            <Text className="font-bold text-white">
              {initial(partner?.fullName ?? partner?.email, "♥")}
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}
