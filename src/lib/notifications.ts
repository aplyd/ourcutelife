import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

type PushPlatform = "ios" | "android" | "web" | "unknown";

const deviceIdKey = "ourcutelife:push-device-id";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions() {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return current;
  return Notifications.requestPermissionsAsync();
}

async function getDeviceId() {
  const existing = await AsyncStorage.getItem(deviceIdKey);
  if (existing) return existing;

  const created = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await AsyncStorage.setItem(deviceIdKey, created);
  return created;
}

export async function getServerPushRegistration() {
  const permission = await requestNotificationPermissions();
  if (!permission.granted) return null;

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string") throw new Error("Missing EAS project ID for push token.");

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  const platform: PushPlatform =
    Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web"
      ? Platform.OS
      : "unknown";

  return {
    token: token.data,
    platform,
    deviceId: await getDeviceId(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}
