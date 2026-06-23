import { useMutation, useQuery } from "convex/react";
import { Redirect } from "expo-router";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, [messages?.length, keyboardVisible]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined || messages === undefined) {
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
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
      className="flex-1 bg-app-bg"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-3 gap-3"
        contentContainerStyle={{ paddingBottom: 132, paddingTop: Math.max(insets.top + 56, 76) }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length ? (
          messages.map((message) => {
            const mine = message.senderUserId === viewer.user._id;
            const coach = message.senderKind === "ai";
            return (
              <View
                key={message._id}
                className={`max-w-[86%] rounded-3xl p-4 ${
                  coach
                    ? "self-center border border-accent bg-accent"
                    : mine
                      ? "self-end border border-accent bg-card"
                      : "self-start border border-soft bg-card"
                }`}
              >
                <Text
                  className={`mb-1 text-xs font-bold uppercase tracking-widest ${coach ? "text-white/75" : "text-muted"}`}
                >
                  {coach ? "Coach" : mine ? "You" : "Partner"} · {formatTime(message.createdAt)}
                </Text>
                <Text className={`text-base leading-6 ${coach ? "text-white" : "text-ink"}`}>
                  {message.text}
                </Text>
              </View>
            );
          })
        ) : (
          <View className="self-center max-w-[90%] rounded-3xl border border-soft bg-card/90 p-4 gap-2">
            <Text className="text-xl font-bold text-ink">Start with the raw version.</Text>
            <Text className="text-base leading-6 text-muted">
              Send directly, ask the coach, or get a safer rephrase before sharing something sharp.
            </Text>
          </View>
        )}
      </ScrollView>

      <View
        className="absolute left-0 right-0 px-3 gap-2"
        style={{ bottom: keyboardVisible ? 8 : Math.max(insets.bottom + 70, 82) }}
      >
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
              className={`rounded-full px-3 py-2 shadow-sm ${mode === value ? "bg-accent" : "bg-card border border-soft"}`}
              onPress={() => setMode(value)}
            >
              <Text
                className={`text-sm font-semibold ${mode === value ? "text-white" : "text-muted"}`}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View className="flex-row gap-2 items-end">
          <TextInput
            multiline
            className="max-h-32 flex-1 rounded-3xl border border-soft bg-card px-4 py-3 text-base text-ink shadow-sm"
            placeholder="Write the honest version…"
            placeholderTextColor="#8c766b"
            value={text}
            onChangeText={setText}
          />
          <Pressable
            className="h-12 rounded-full bg-accent px-5 items-center justify-center shadow-sm"
            disabled={!text.trim() || isSending}
            onPress={handleSend}
          >
            <Text className="font-bold text-white">Send</Text>
          </Pressable>
        </View>
      </View>
      <MeHeaderButton />
    </KeyboardAvoidingView>
  );
}
