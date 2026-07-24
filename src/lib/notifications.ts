import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

type PushPlatform = "ios" | "android" | "web" | "unknown";
type ServerPermissionStatus = "undetermined" | "denied" | "granted";

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

function getPlatform(): PushPlatform {
  return Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web"
    ? Platform.OS
    : "unknown";
}

function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function mapPermissionStatus(permission: Notifications.NotificationPermissionsStatus) {
  if (permission.granted) return "granted" as const;
  return permission.status === Notifications.PermissionStatus.UNDETERMINED
    ? ("undetermined" as const)
    : ("denied" as const);
}

async function buildPermissionObservation(permission: Notifications.NotificationPermissionsStatus) {
  return {
    platform: getPlatform(),
    deviceId: await getDeviceId(),
    timezone: getTimezone(),
    permissionStatus: mapPermissionStatus(permission) satisfies ServerPermissionStatus,
  };
}

function getEasProjectId() {
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string") throw new Error("Missing EAS project ID for push token.");
  return projectId;
}

export async function reconcileServerPushRegistration() {
  const permission = await Notifications.getPermissionsAsync();
  const observation = await buildPermissionObservation(permission);
  const token =
    observation.permissionStatus === "granted"
      ? await Promise.resolve()
          .then(() => Notifications.getExpoPushTokenAsync({ projectId: getEasProjectId() }))
          .catch(() => null)
      : null;
  const registration = token
    ? {
        pushToken: token.data,
        platform: observation.platform,
        deviceId: observation.deviceId,
        timezone: observation.timezone,
      }
    : null;

  return { observation, registration };
}

export async function requestServerPushRegistration() {
  const permission = await requestNotificationPermissions();
  const observation = await buildPermissionObservation(permission);
  if (observation.permissionStatus !== "granted") return { observation, registration: null };
  const token = await Notifications.getExpoPushTokenAsync({ projectId: getEasProjectId() });

  return {
    observation,
    registration: {
      pushToken: token.data,
      platform: observation.platform,
      deviceId: observation.deviceId,
      timezone: observation.timezone,
    },
  };
}
