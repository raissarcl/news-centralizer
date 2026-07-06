import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';

export default function TabsLayout() {
  const { tokens } = useTheme();
  const router = useRouter();

  const headerRight = () => (
    <Pressable
      onPress={() => router.push('/settings')}
      hitSlop={12}
      style={({ pressed }) => ({
        paddingHorizontal: 12,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <Ionicons name="settings-outline" size={22} color={tokens.text} />
    </Pressable>
  );

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: tokens.bg },
        headerTitleStyle: { color: tokens.text, fontWeight: '600' },
        headerTintColor: tokens.text,
        headerShadowVisible: false,
        tabBarStyle: {
          backgroundColor: tokens.bg,
          borderTopColor: tokens.border,
        },
        tabBarActiveTintColor: tokens.primary,
        tabBarInactiveTintColor: tokens.textMuted,
        sceneStyle: { backgroundColor: tokens.bg },
        headerRight,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.tabTimeline,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="newspaper-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="folders"
        options={{
          title: t.tabFolders,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="folder-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="sources"
        options={{
          title: t.tabSources,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="globe-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
