import { router } from "expo-router";
import type { JSX } from "react";
import { Pressable, Text, View } from "react-native";

export function MeHeaderButton(): JSX.Element {
  return (
    <Pressable className="absolute right-6 top-14 z-10" onPress={() => router.push("/me")}>
      <View className="flex-row w-16">
        <View className="h-11 w-11 rounded-full bg-[#7c3aed] border-2 border-white items-center justify-center">
          <Text className="font-bold text-white">You</Text>
        </View>
        <View className="h-11 w-11 -ml-5 rounded-full bg-[#f97316] border-2 border-white items-center justify-center">
          <Text className="font-bold text-white">♥</Text>
        </View>
      </View>
    </Pressable>
  );
}
