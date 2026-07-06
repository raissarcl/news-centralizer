import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { t } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('news-updates', {
    name: 'Novos itens',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function notifyNewItems(
  count: number,
  headlines: string[] = []
): Promise<void> {
  if (count <= 0) return;
  await ensureNotificationChannel();

  let body = t.newItems(count);
  if (headlines.length > 0 && count <= 5) {
    body = headlines.slice(0, 2).join('\n');
    if (count > 2) {
      body += `\n${t.newItems(count - 2)}`;
    }
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: t.appName,
      body,
    },
    trigger: null,
  });
}
