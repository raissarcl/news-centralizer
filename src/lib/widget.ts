import { Platform } from 'react-native';
import { countUnreadItems } from '@/store/feeds';

const { NewsCentralizerWidgetSync } = require('react-native').NativeModules as {
  NewsCentralizerWidgetSync?: { updateWidgetData: (json: string) => void };
};

export async function syncAndroidWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  if (!NewsCentralizerWidgetSync?.updateWidgetData) return;
  try {
    const unread = countUnreadItems();
    NewsCentralizerWidgetSync.updateWidgetData(
      JSON.stringify({ unread, updatedAt: new Date().toISOString() })
    );
  } catch {
    // widget module optional until prebuild
  }
}
