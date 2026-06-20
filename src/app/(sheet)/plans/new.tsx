import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/betterAuth";

type Category = "food" | "drinks" | "entertainment" | "activity" | "intimacy";
const categories: Array<{ value: Category; label: string }> = [
  { value: "food", label: "Food" },
  { value: "drinks", label: "Drinks" },
  { value: "entertainment", label: "Entertainment" },
  { value: "activity", label: "Activity" },
  { value: "intimacy", label: "Intimacy" },
];

export default function NewPlanItemScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useQuery(api.auth.viewer, {});
  const createPlan = useMutation(api.plans.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Category>("food");
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const canSave = useMemo(
    () => Boolean(title.trim() && description.trim() && !isSaving),
    [description, isSaving, title],
  );

  if (!betterAuthSession.data?.session) return <Redirect href="/auth" />;
  if (viewer === undefined)
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  if (!viewer?.couple || viewer.memberCount < 2) return <Redirect href="/pairing" />;

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    try {
      await createPlan({
        title,
        description,
        category,
        subcategories: tags
          .split(/[#,]/)
          .map((tag) => tag.trim())
          .filter(Boolean),
      });
      router.replace(`/plans/match/${category}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this plan item.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-6 pt-16 pb-10 gap-5">
      <View className="gap-2">
        <Text className="text-sm font-semibold uppercase tracking-widest text-[#8c766b]">
          Add plan item
        </Text>
        <Text className="text-4xl font-bold text-[#2f211c]">Suggest it safely</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Your partner can swipe on it, but they won’t know you created it unless it becomes a
          match.
        </Text>
      </View>

      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Title</Text>
        <TextInput
          className="h-12 rounded-2xl border border-[#e6d2c2] bg-white/80 px-4 text-base text-[#2f211c]"
          value={title}
          onChangeText={setTitle}
          placeholder="Try that new ramen place"
        />
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Description</Text>
        <TextInput
          multiline
          className="min-h-28 rounded-2xl border border-[#e6d2c2] bg-white/80 px-4 py-3 text-base leading-6 text-[#2f211c]"
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
          placeholder="Enough detail to make the swipe easy."
        />
      </View>
      <View className="gap-3">
        <Text className="text-sm font-semibold text-[#6f5a50]">Category</Text>
        <View className="flex-row flex-wrap gap-2">
          {categories.map((item) => (
            <Pressable
              key={item.value}
              className={`rounded-full px-4 py-2 ${category === item.value ? "bg-[#2f211c]" : "bg-white/80 border border-[#e6d2c2]"}`}
              onPress={() => setCategory(item.value)}
            >
              <Text
                className={`font-semibold ${category === item.value ? "text-white" : "text-[#6f5a50]"}`}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View className="gap-2">
        <Text className="text-sm font-semibold text-[#6f5a50]">Hashtags / subcategories</Text>
        <TextInput
          className="h-12 rounded-2xl border border-[#e6d2c2] bg-white/80 px-4 text-base text-[#2f211c]"
          value={tags}
          onChangeText={setTags}
          placeholder="cozy, spicy, outside"
        />
      </View>
      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable
        className={`h-14 rounded-full items-center justify-center ${canSave ? "bg-[#2f211c]" : "bg-[#d8c2b4]"}`}
        disabled={!canSave}
        onPress={handleSave}
      >
        <Text className="font-bold text-white">Save private suggestion</Text>
      </Pressable>
    </ScrollView>
  );
}
