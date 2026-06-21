import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import type { JSX } from "react";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

export default function EditProfileSheet(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const updateProfile = useMutation(api.auth.updateProfile);
  const generateUploadUrl = useMutation(api.auth.generateProfilePhotoUploadUrl);
  const saveProfilePhoto = useMutation(api.auth.saveProfilePhoto);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  useEffect(() => {
    if (viewer?.user) {
      setFullName(viewer.user.fullName ?? "");
      setAvatarUrl(viewer.user.avatarUrl ?? "");
    }
  }, [viewer?.user]);

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined)
    return (
      <View className="flex-1 bg-app-bg items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  async function handlePickPhoto() {
    setError(null);
    setIsUploadingPhoto(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Photos needed", "Allow photo access to upload a profile picture.");
        return;
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        mediaTypes: ["images"],
        quality: 0.82,
      });
      if (picked.canceled) return;

      const asset = picked.assets[0];
      const uploadUrl = await generateUploadUrl({});
      const blob = await fetch(asset.uri).then((res) => res.blob());
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": asset.mimeType ?? "image/jpeg" },
        body: blob,
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
      const { storageId } = await response.json();
      const saved = await saveProfilePhoto({ storageId });
      setAvatarUrl(saved.avatarUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload profile photo.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

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
    <ScrollView className="flex-1 bg-app-bg" contentContainerClassName="px-3 pt-8 pb-10 gap-3">
      <View className="items-center">
        <View className="h-1.5 w-12 rounded-full bg-soft" />
      </View>
      <Text className="text-3xl font-bold text-ink">Edit profile</Text>

      <View className="items-center gap-3 rounded-3xl border border-soft bg-card/90 p-4">
        <Pressable
          className="h-28 w-28 overflow-hidden rounded-full bg-accent items-center justify-center"
          disabled={isUploadingPhoto}
          onPress={handlePickPhoto}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} className="h-28 w-28" />
          ) : (
            <Text className="text-4xl font-bold text-white">
              {(fullName || viewer.user.email || "?").slice(0, 1).toUpperCase()}
            </Text>
          )}
        </Pressable>
        <Pressable
          className="rounded-full bg-ink px-4 py-2"
          disabled={isUploadingPhoto}
          onPress={handlePickPhoto}
        >
          <Text className="font-bold text-app-bg">
            {isUploadingPhoto ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
          </Text>
        </Pressable>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-muted">Name</Text>
        <TextInput
          className="h-12 rounded-2xl border border-soft bg-card/90 px-4 text-base text-ink"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Your name"
          placeholderTextColor="#8c766b"
        />
      </View>
      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable
        className={`h-14 rounded-full items-center justify-center ${fullName.trim() && !isSaving ? "bg-ink" : "bg-soft"}`}
        disabled={!fullName.trim() || isSaving}
        onPress={handleSave}
      >
        <Text className="font-bold text-app-bg">{isSaving ? "Saving…" : "Save profile"}</Text>
      </Pressable>
    </ScrollView>
  );
}
