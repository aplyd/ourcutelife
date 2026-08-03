import { useAppMutation, useAppQuery } from "@/lib/devMock";
import { Redirect } from "expo-router";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";

import { api } from "../../convex/_generated/api";
import { authClient, useSession } from "@/lib/betterAuth";
import { resolveMembershipAccess } from "@/lib/membershipAccess";
import { requestServerPushRegistration } from "@/lib/notifications";

function formatExpiry(expiresAt: number | null | undefined): string | null {
  if (!expiresAt) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(expiresAt));
}

function formatPairingInput(value: string): string {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits;
}

export default function PairingScreen(): JSX.Element {
  const betterAuthSession = useSession();
  const viewer = useAppQuery(api.auth.viewer, {});
  const createCoupleAndCode = useAppMutation(api.pairing.createCoupleAndCode);
  const joinWithCode = useAppMutation(api.pairing.joinWithCode);
  const leaveCouple = useAppMutation(api.pairing.leaveCouple);
  const reportPermissionObservation = useAppMutation(
    api.notificationDevices.reportPermissionObservation,
  );
  const registerGrantedDevice = useAppMutation(api.notificationDevices.registerGrantedDevice);
  const membershipAccess = resolveMembershipAccess({
    sessionPending: betterAuthSession.isPending,
    hasSession: Boolean(betterAuthSession.data?.session),
    viewer,
  });

  const [anniversaryDateText, setAnniversaryDateText] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [code, setCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [generatedCodeExpiresAt, setGeneratedCodeExpiresAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const daysTogether = useMemo(() => {
    const anniversaryTime = new Date(`${anniversaryDateText}T00:00:00`).getTime();
    const diff = Date.now() - anniversaryTime;
    return Math.max(0, Math.floor(diff / 86_400_000));
  }, [anniversaryDateText]);

  if (membershipAccess === "signed-out") return <Redirect href="/auth" />;
  if (membershipAccess === "loading") {
    return (
      <View className="flex-1 bg-[#fff8f1] items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (membershipAccess === "paired") return <Redirect href="/(tabs)" />;

  async function registerForNotificationsAfterPairing() {
    try {
      const result = await requestServerPushRegistration();
      await reportPermissionObservation(result.observation);
      if (result.registration) await registerGrantedDevice(result.registration);
    } catch {
      // Pairing must still succeed when push permission or token registration is unavailable.
    }
  }

  async function handleCreateCode() {
    const anniversaryTime = new Date(`${anniversaryDateText}T00:00:00`).getTime();
    if (!Number.isFinite(anniversaryTime)) {
      setError("Enter the anniversary date as YYYY-MM-DD.");
      return;
    }
    setError(null);
    setIsWorking(true);
    try {
      const result = await createCoupleAndCode({
        anniversaryDate: anniversaryTime,
      });
      setGeneratedCode(result.code);
      setGeneratedCodeExpiresAt(result.expiresAt);
      await registerForNotificationsAfterPairing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a pairing code.");
    } finally {
      setIsWorking(false);
    }
  }

  async function handleJoin() {
    setError(null);
    setIsWorking(true);
    try {
      await joinWithCode({
        code,
      });
      await registerForNotificationsAfterPairing();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join with that code.");
    } finally {
      setIsWorking(false);
    }
  }

  function handleResetPairing() {
    Alert.alert(
      "Reset pairing setup?",
      "This removes your account from every current relationship link so you can pair again. Your partner, shared memories, and relationship data are not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset pairing setup",
          style: "destructive",
          onPress: () => {
            setError(null);
            setIsWorking(true);
            void leaveCouple({})
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : "Could not reset pairing setup.");
              })
              .finally(() => setIsWorking(false));
          },
        },
      ],
    );
  }

  const displayedCode = generatedCode ?? viewer?.activePairingCode ?? null;
  const displayedCodeExpiresAt =
    generatedCodeExpiresAt ?? viewer?.activePairingCodeExpiresAt ?? null;
  const displayedExpiry = formatExpiry(displayedCodeExpiresAt);

  async function handleShare() {
    if (!displayedCode) return;
    await Share.share({
      message: `Join me on Our Cute Life with pairing code ${displayedCode}`,
    });
  }

  return (
    <ScrollView className="flex-1 bg-[#fff8f1]" contentContainerClassName="px-3 py-16 gap-3">
      <View className="gap-2">
        <Text className="text-4xl font-bold text-[#2f211c]">Pair your space</Text>
        <Text className="text-base leading-6 text-[#6f5a50]">
          Create a private relationship space or enter the code your partner sent you.
        </Text>
      </View>

      <View className="rounded-3xl bg-white/80 p-4 gap-4 border border-[#f1dfd2]">
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
          <Text className="font-semibold text-white">
            {displayedCode ? "Generate a fresh code" : "Generate pairing code"}
          </Text>
        </Pressable>
        {displayedCode ? (
          <View className="gap-3 rounded-2xl bg-[#f4ecff] p-4">
            <Text className="text-sm text-[#6f5a50]">Share this with your partner:</Text>
            <Text className="text-4xl font-bold tracking-widest text-[#2f211c]">
              {displayedCode}
            </Text>
            {displayedExpiry ? (
              <Text className="text-sm text-[#6f5a50]">Expires {displayedExpiry}</Text>
            ) : null}
            <Pressable
              className="h-11 rounded-full bg-[#2f211c] items-center justify-center"
              onPress={handleShare}
            >
              <Text className="font-semibold text-[#fff8f1]">Share code</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View className="rounded-3xl bg-white/80 p-4 gap-4 border border-[#f1dfd2]">
        <Text className="text-xl font-semibold text-[#2f211c]">I have a code</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="number-pad"
          maxLength={7}
          className="h-12 rounded-2xl border border-[#e6d2c2] px-4 text-xl tracking-widest text-[#2f211c]"
          placeholder="482-913"
          value={code}
          onChangeText={(value) => setCode(formatPairingInput(value))}
        />
        <Pressable
          className="h-12 rounded-full bg-[#2f211c] items-center justify-center"
          disabled={isWorking || code.replace(/[^0-9]/g, "").length !== 6}
          onPress={handleJoin}
        >
          <Text className="font-semibold text-[#fff8f1]">Join partner</Text>
        </Pressable>
      </View>

      {viewer?.membership ? (
        <View className="rounded-3xl bg-white/80 p-4 gap-3 border border-[#f1dfd2]">
          <Text className="text-lg font-semibold text-[#2f211c]">Pairing not working?</Text>
          <Text className="text-sm leading-5 text-[#6f5a50]">
            Clear this account’s current relationship links, then create or join a fresh pairing.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="h-11 rounded-full border border-red-300 items-center justify-center"
            disabled={isWorking}
            onPress={handleResetPairing}
          >
            <Text className="font-semibold text-red-700">Reset pairing setup</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
      <Pressable className="items-center" onPress={() => void authClient.signOut()}>
        <Text className="text-sm text-[#8c766b]">Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}
