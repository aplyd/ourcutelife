import { useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { JSX } from "react";
import { ActivityIndicator, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function TabsLayout(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  return (
    <NativeTabs
      backgroundColor="rgba(255, 248, 241, 0.72)"
      blurEffect="systemUltraThinMaterial"
      disableTransparentOnScrollEdge={false}
      iconColor="#8c766b"
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "heart.text.square", selected: "heart.text.square.fill" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="moments">
        <NativeTabs.Trigger.Label>Moments</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "book.pages", selected: "book.pages.fill" }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="review">
        <NativeTabs.Trigger.Label>Review</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "calendar.badge.clock", selected: "calendar.badge.clock" }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Label>Plans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "fork.knife.circle", selected: "fork.knife.circle.fill" }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
