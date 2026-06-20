import { useMutation, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import type { JSX } from "react";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../../../convex/_generated/api";
import { MeHeaderButton } from "@/components/MeHeaderButton";
import { useSession } from "@/lib/betterAuth";

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    new Date(timestamp),
  );
}

export default function ChatTab(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const messages = useQuery(api.chat.list, {});
  const send = useMutation(api.chat.send);
  const [text, setText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [mode, setMode] = useState<"normal" | "coach" | "rephrase">("normal");

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || messages === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  async function handleSend() {
    if (!text.trim() || isSending) return;
    setIsSending(true);
    try {
      await send({
        text: mode === "rephrase" ? `Rephrase this before I send it: ${text}` : text,
        asCoachPrompt: mode !== "normal",
      });
      setText("");
      setMode("normal");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-[#fff8f1]"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <MeHeaderButton />
      <View className="px-6 pt-16 pb-3 pr-24 gap-2 border-b border-[#f1dfd2]">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">Chat</Text>
        <Text className="text-3xl font-bold text-[#2f211c]">You, your person, and the coach</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          The coach is invoked-only. No creepy lurking.
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="px-6 py-5 pb-40 gap-3">
        {messages.length ? (
          messages.map((message) => {
            const mine = message.senderUserId === viewer.user._id;
            const coach = message.senderKind === "ai";
            return (
              <View
                key={message._id}
                className={`max-w-[86%] rounded-3xl p-4 ${coach ? "self-center bg-[#2f211c]" : mine ? "self-end bg-[#7c3aed]" : "self-start bg-white border border-[#f1dfd2]"}`}
              >
                <Text
                  className={`mb-1 text-xs font-bold uppercase tracking-widest ${coach || mine ? "text-white/70" : "text-[#8c766b]"}`}
                >
                  {coach ? "Coach" : mine ? "You" : "Partner"} · {formatTime(message.createdAt)}
                </Text>
                <Text
                  className={`text-base leading-6 ${coach || mine ? "text-white" : "text-[#2f211c]"}`}
                >
                  {message.text}
                </Text>
              </View>
            );
          })
        ) : (
          <View className="rounded-3xl bg-white/85 border border-[#f1dfd2] p-5 gap-2">
            <Text className="text-xl font-bold text-[#2f211c]">Start with the raw version.</Text>
            <Text className="text-base leading-6 text-[#6f5a50]">
              Send a message, ask the coach, or ask for a safer rephrase before you share something
              sharp.
            </Text>
          </View>
        )}
      </ScrollView>

      <View className="px-4 pb-28 pt-3 gap-3 border-t border-[#f1dfd2] bg-[#fff8f1]">
        <View className="flex-row gap-2">
          {(
            [
              ["normal", "Normal"],
              ["coach", "Ask coach"],
              ["rephrase", "Rephrase"],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              className={`rounded-full px-3 py-2 ${mode === value ? "bg-[#2f211c]" : "bg-white border border-[#e6d2c2]"}`}
              onPress={() => setMode(value)}
            >
              <Text
                className={`text-sm font-semibold ${mode === value ? "text-white" : "text-[#6f5a50]"}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row gap-2 items-end">
          <TextInput
            multiline
            className="max-h-32 flex-1 rounded-3xl border border-[#e6d2c2] bg-white px-4 py-3 text-base text-[#2f211c]"
            placeholder="Write the honest version…"
            value={text}
            onChangeText={setText}
          />
          <Pressable
            className="h-12 rounded-full bg-[#7c3aed] px-5 items-center justify-center"
            disabled={!text.trim() || isSending}
            onPress={handleSend}
          >
            <Text className="font-bold text-white">Send</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
