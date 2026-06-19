import type { JSX } from "react";
import { Text, View } from "react-native";

export default function MomentsTab(): JSX.Element {
  return (
    <View className="flex-1 bg-[#fff8f1] px-6 pt-16 gap-4">
      <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
        Moments
      </Text>
      <Text className="text-4xl font-bold text-[#2f211c]">
        Private notes first. Relationship-safe summaries later.
      </Text>
      <Text className="text-base leading-6 text-[#6f5a50]">
        Phase 2 will add good, hard, and mixed moment capture. Raw notes stay private; AI-generated
        briefs are shared in a couple-visible chat.
      </Text>
    </View>
  );
}
