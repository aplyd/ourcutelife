import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function EditProfileSheet(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const updateProfile = useMutation(api.auth.updateProfile);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (viewer?.user) {
      setFullName(viewer.user.fullName ?? "");
      setAvatarUrl(viewer.user.avatarUrl ?? "");
    }
  }, [viewer?.user]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined) return <View className="flex-1 bg-[#fff8f1] items-center justify-center"><ActivityIndicator /></View>;
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      await updateProfile({ fullName, avatarUrl: avatarUrl || undefined });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update profile.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-8 pb-10 gap-5">
      <View className="items-center"><View className="h-1.5 w-12 rounded-full bg-[#d8c2b4]" /></View>
      <Text className="text-3xl font-bold text-[#2f211c]">Edit profile</Text>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Name</Text>
        <TextInput className="h-12 rounded-2xl border border-[#e6d2c2] bg-white/90 px-4 text-base text-[#2f211c]" value={fullName} onChangeText={setFullName} placeholder="Your name" />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Avatar URL for now</Text>
        <TextInput className="h-12 rounded-2xl border border-[#e6d2c2] bg-white/90 px-4 text-base text-[#2f211c]" value={avatarUrl} onChangeText={setAvatarUrl} placeholder="https://…" autoCapitalize="none" />
      </View>
      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable className={`h-14 rounded-full items-center justify-center ${fullName.trim() && !isSaving ? "bg-[#2f211c]" : "bg-[#d8c2b4]"}`} disabled={!fullName.trim() || isSaving} onPress={handleSave}>
        <Text className="font-bold text-white">{isSaving ? "Saving…" : "Save profile"}</Text>
      </Pressable>
    </ScrollView>
  );
}
