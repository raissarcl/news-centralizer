import { Stack } from 'expo-router';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';

export default function FolderLayout() {
  const { tokens } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: tokens.bg },
        headerTitleStyle: { color: tokens.text, fontWeight: '600' },
        headerTintColor: tokens.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: tokens.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: t.folders }} />
      <Stack.Screen name="feeds" options={{ title: t.folderFeeds }} />
      <Stack.Screen name="settings" options={{ title: t.folderSettings }} />
    </Stack>
  );
}
