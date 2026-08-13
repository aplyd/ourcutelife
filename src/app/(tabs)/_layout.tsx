import { useAppQuery } from "@/lib/devMock";
import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import type { JSX } from "react";
import { ActivityIndicator, View } from "react-native";

import { api } from "../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function TabsLayout(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useAppQuery(api.auth.viewer, {});

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
          src={{
            default: require("../../../assets/tab-icons/today.png"),
            selected: require("../../../assets/tab-icons/today-selected.png"),
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: require("../../../assets/tab-icons/chat.png"),
            selected: require("../../../assets/tab-icons/chat-selected.png"),
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="plans">
        <NativeTabs.Trigger.Label>Plans</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: require("../../../assets/tab-icons/plans.png"),
            selected: require("../../../assets/tab-icons/plans-selected.png"),
          }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="me">
        <NativeTabs.Trigger.Label>Me</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={{
            default: require("../../../assets/tab-icons/me.png"),
            selected: require("../../../assets/tab-icons/me-selected.png"),
          }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
