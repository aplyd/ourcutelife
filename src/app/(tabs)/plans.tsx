import type { JSX } from "react";
import { Text, View } from "react-native";

export default function PlansTab(): JSX.Element {
  return (
    <View className="flex-1 bg-[#fff8f1] px-6 pt-16 gap-4">
      <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">Plans</Text>
      <Text className="text-4xl font-bold text-[#2f211c]">Swipe into the same plan</Text>
      <Text className="text-base leading-6 text-[#6f5a50]">
        Phase 5 will add dinner, date, and activity cards where both partners swipe until there’s a
        mutual match.
      </Text>
    </View>
  );
}
