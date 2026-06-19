import type { JSX } from "react";
import { Text, View } from "react-native";

export default function ReviewTab(): JSX.Element {
  return (
    <View className="flex-1 bg-[#fff8f1] px-6 pt-16 gap-4">
      <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">Review</Text>
      <Text className="text-4xl font-bold text-[#2f211c]">Monthly review walkthrough</Text>
      <Text className="text-base leading-6 text-[#6f5a50]">
        Each partner gets a private AI reflection first. After both reflect, the app opens a shared,
        non-blaming conversation to celebrate wins and resolve patterns.
      </Text>
    </View>
  );
}
