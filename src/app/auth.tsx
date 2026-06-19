import type { JSX } from "react";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Redirect, router } from "expo-router";

import { useAppleSignIn } from "@/lib/appleAuth";
import { useAuthSession } from "@/lib/authSession";

export default function AuthLanding(): JSX.Element {
  const { userId, sessionToken, setSession, signOut } = useAuthSession();
  const signInWithApple = useAppleSignIn();
  const [error, setError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);

  if (userId && sessionToken) return <Redirect href="/pairing" />;

  async function handleSignIn() {
    setError(null);
    setIsSigningIn(true);
    try {
      const result = await signInWithApple();
      setSession(result);
      router.replace("/pairing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apple sign in failed.");
    } finally {
      setIsSigningIn(false);
    }
  }

  return (
    <View className="flex-1 bg-[#fff8f1] px-6 justify-center gap-8">
      <View className="gap-4">
        <Text className="text-5xl font-bold text-[#2f211c]">Our Cute Life</Text>
        <Text className="text-xl leading-8 text-[#6f5a50]">
          A private space for you and your partner to remember, reflect, and grow together.
        </Text>
      </View>

      <View className="gap-3">
        <Pressable
          className="h-14 rounded-full bg-[#2f211c] items-center justify-center"
          disabled={isSigningIn}
          onPress={handleSignIn}
        >
          {isSigningIn ? (
            <ActivityIndicator color="#fff8f1" />
          ) : (
            <Text className="text-base font-semibold text-[#fff8f1]">Continue with Apple</Text>
          )}
        </Pressable>
        <Text className="text-center text-sm text-[#8c766b]">
          Apple auth keeps the first version simple and private.
        </Text>
        {error ? <Text className="text-center text-sm text-red-700">{error}</Text> : null}
        {userId && !sessionToken ? (
          <Pressable className="items-center" onPress={signOut}>
            <Text className="text-sm text-[#8c766b]">Clear old session and sign in again</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
