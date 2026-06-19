import { useMutation, useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Share, Text, TextInput, View } from "react-native";

import { api } from "../../convex/_generated/api";
import { useAuthSession } from "@/lib/authSession";

export default function PairingScreen(): JSX.Element {
  const { userId, sessionToken, signOut } = useAuthSession();
  const viewer = useQuery(api.auth.viewer, {
    userId: userId ?? undefined,
    sessionToken: sessionToken ?? undefined,
  });
  const createCoupleAndCode = useMutation(api.pairing.createCoupleAndCode);
  const joinWithCode = useMutation(api.pairing.joinWithCode);

  const [anniversaryDateText, setAnniversaryDateText] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const daysTogether = useMemo(() => {
    const anniversaryTime = new Date(`${anniversaryDateText}T00:00:00`).getTime();
    const diff = Date.now() - anniversaryTime;
    return Math.max(0, Math.floor(diff / 86_400_000));
  }, [anniversaryDateText]);

  if (!userId || !sessionToken) return <Redirect href="/auth" />;
  if (viewer === undefined) {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (viewer?.couple && viewer.memberCount >= 2) return <Redirect href="/(tabs)" />;

  async function handleCreateCode() {
    if (!userId || !sessionToken) return;
    const anniversaryTime = new Date(`${anniversaryDateText}T00:00:00`).getTime();
    if (!Number.isFinite(anniversaryTime)) {
      setError("Enter the anniversary date as YYYY-MM-DD.");
      return;
    }
    setError(null);
    setIsWorking(true);
    try {
      const result = await createCoupleAndCode({
        userId,
        sessionToken,
        anniversaryDate: anniversaryTime,
      });
      setGeneratedCode(result.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a pairing code.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleJoin() {
    if (!userId || !sessionToken) return;
    setError(null);
    setIsWorking(true);
    try {
      await joinWithCode({ userId, sessionToken, code });
      router.replace("/(tabs)");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join with that code.");
    } finally {
      setIsWorking(false);
    }
  }

  const displayedCode = generatedCode ?? viewer?.activePairingCode ?? null;

  async function handleShare() {
    if (!displayedCode) return;
    await Share.share({ message: `Join me on Our Cute Life with pairing code ${displayedCode}` });
  }

  return (
    <View className="flex-1 bg-[#fff8f1] px-6 py-16 gap-6">
      <View className="gap-2">
        <Text className="text-4xl font-bold text-[#2f211c]">Pair your space</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Create a private relationship space or enter the code your partner sent you.
        </Text>
      </View>

      <View className="rounded-3xl bg-white/80 p-5 gap-4 border border-[#f1dfd2]">
        <Text className="text-xl font-semibold text-[#2f211c]">Create a code</Text>
        <Text className="text-sm text-[#6f5a50]">Anniversary / started dating date</Text>
        <TextInput
          className="h-12 rounded-2xl border border-[#e6d2c2] px-4 text-base text-[#2f211c]"
          placeholder="YYYY-MM-DD"
          value={anniversaryDateText}
          onChangeText={setAnniversaryDateText}
        />
        <Text className="text-sm text-[#8c766b]">
          This unlocks the “{daysTogether} days together” stat.
        </Text>
        <Pressable
          className="h-12 rounded-full bg-[#7c3aed] items-center justify-center"
          disabled={isWorking}
          onPress={handleCreateCode}
        >
          <Text className="font-semibold text-white">Generate pairing code</Text>
        </Pressable>
        {displayedCode ? (
          <View className="gap-3 rounded-2xl bg-[#f4ecff] p-4">
            <Text className="text-sm text-[#6f5a50]">Share this with your partner:</Text>
            <Text className="text-4xl font-bold tracking-widest text-[#2f211c]">
              {displayedCode}
            </Text>
            <Pressable
              className="h-11 rounded-full bg-[#2f211c] items-center justify-center"
              onPress={handleShare}
            >
              <Text className="font-semibold text-[#fff8f1]">Share code</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View className="rounded-3xl bg-white/80 p-5 gap-4 border border-[#f1dfd2]">
        <Text className="text-xl font-semibold text-[#2f211c]">I have a code</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="number-pad"
          maxLength={7}
          className="h-12 rounded-2xl border border-[#e6d2c2] px-4 text-xl tracking-widest text-[#2f211c]"
          placeholder="482-913"
          value={code}
          onChangeText={setCode}
        />
        <Pressable
          className="h-12 rounded-full bg-[#2f211c] items-center justify-center"
          disabled={isWorking || code.replace(/[^0-9]/g, "").length !== 6}
          onPress={handleJoin}
        >
          <Text className="font-semibold text-[#fff8f1]">Join partner</Text>
        </Pressable>
      </View>

      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable className="items-center" onPress={signOut}>
        <Text className="text-sm text-[#8c766b]">Sign out</Text>
      </Pressable>
    </View>
  );
}
