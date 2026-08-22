import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettingsStore } from '@/store/settings';
import { useFeedsStore } from '@/store/feeds';
import {
  hydrateApp,
  PersistError,
  setPersistFailureListener,
} from '@/store/persistApp';
import { useTimelineUiStore } from '@/store/timelineUi';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import { ensureNotificationChannel, notifyNewItems } from '@/lib/notifications';

/** Prevent overlapping hydrate+seed under Strict Mode / Fast Refresh. */
let bootInFlight: Promise<void> | null = null;

function handleDeepLink(url: string): void {
  const parsed = Linking.parse(url);
  const path = parsed.path ?? '';
  if (path.includes('timeline') || path === '' || path === '/') {
    const filter = parsed.queryParams?.filter;
    if (filter === 'unread') {
      useTimelineUiStore.getState().setTimelineFilter('unread');
    }
  }
}

export default function RootLayout() {
  const [bootReady, setBootReady] = useState(false);
  const seedDefaultsIfNeeded = useFeedsStore((s) => s.seedDefaultsIfNeeded);
  const seedGeneralIfNeeded = useFeedsStore((s) => s.seedGeneralIfNeeded);
  const refreshAll = useFeedsStore((s) => s.refreshAll);

  useEffect(() => {
    void (async () => {
      const pending =
        bootInFlight ??
        (bootInFlight = (async () => {
          await hydrateApp();
          await seedDefaultsIfNeeded();
          await seedGeneralIfNeeded();
          await ensureNotificationChannel();
        })().finally(() => {
          bootInFlight = null;
        }));
      try {
        await pending;
      } finally {
        setBootReady(true);
      }

      if (useSettingsStore.getState().settings.refreshOnOpen) {
        const { newCount, newHeadlines } = await refreshAll();
        if (useSettingsStore.getState().settings.notifyOnNewItems) {
          await notifyNewItems(newCount, newHeadlines);
        }
      }
    })();
  }, [seedDefaultsIfNeeded, seedGeneralIfNeeded, refreshAll]);

  useEffect(() => {
    setPersistFailureListener((err) => {
      const message =
        err instanceof PersistError ? err.message : t.persistFailed;
      Alert.alert(t.appName, message);
    });
    return () => setPersistFailureListener(null);
  }, []);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) =>
      handleDeepLink(url),
    );
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <BootLoadingGate ready={bootReady}>
          <ThemedStack />
        </BootLoadingGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function BootLoadingGate({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const { tokens } = useTheme();
  if (ready) return <>{children}</>;
  return (
    <View style={[styles.bootRoot, { backgroundColor: tokens.bg }]}>
      <ActivityIndicator size="large" color={tokens.primary} />
    </View>
  );
}

function ThemedStack() {
  const { tokens, isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: tokens.bg },
          headerStyle: { backgroundColor: tokens.bg },
          headerTitleStyle: { color: tokens.text },
          headerTintColor: tokens.text,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ presentation: 'modal', title: t.settings }}
        />
        <Stack.Screen name="folder/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="source/[id]" options={{ title: t.sourceDetail }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  bootRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
