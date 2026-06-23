import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

const dailyPromptReminderKey = "ourcutelife:daily-prompt-reminder-id";

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

export async function ensureDailyPromptReminder() {
  const permission = await requestNotificationPermissions();
  if (!permission.granted) return;

  const existingId = await AsyncStorage.getItem(dailyPromptReminderKey);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  if (existingId && scheduled.some((notification) => notification.identifier === existingId))
    return;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Daily prompt",
      body: "Take two minutes to answer today's relationship prompt.",
      data: { url: "/prompts/today" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: 19,
      minute: 0,
    },
  });

  await AsyncStorage.setItem(dailyPromptReminderKey, id);
}
