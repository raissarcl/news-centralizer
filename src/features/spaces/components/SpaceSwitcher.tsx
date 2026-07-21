import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useFeedsStore } from '@/store/feeds';
import { useSettingsStore } from '@/store/settings';
import { resolveActiveSpaceId } from '@/lib/spaces';
import { spaceDisplayName, t } from '@/lib/i18n';
import { useTheme } from '@/theme';
import type { Space } from '@/types';

function shouldLeaveDetailRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.includes('/folder/') ||
    pathname.includes('/source/') ||
    pathname.startsWith('folder/') ||
    pathname.startsWith('source/')
  );
}

function spaceIconName(space: Space): keyof typeof Ionicons.glyphMap {
  return (space.icon ?? 'layers-outline') as keyof typeof Ionicons.glyphMap;
}

export function SpaceSwitcher() {
  const { tokens } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const spaces = useFeedsStore((s) => s.spaces);
  const setActiveSpaceId = useFeedsStore((s) => s.setActiveSpaceId);
  const activeSpaceId = useSettingsStore((s) =>
    resolveActiveSpaceId(s.settings.activeSpaceId, spaces),
  );

  const activeSpace =
    spaces.find((s) => s.id === activeSpaceId) ?? spaces[0] ?? null;

  const switchToSpace = async (spaceId: string) => {
    setOpen(false);
    if (spaceId === activeSpaceId) return;
    if (shouldLeaveDetailRoute(pathname)) {
      router.replace('/(tabs)');
    }
    // Switch first so UI shows the new space; refreshAll is scoped to active space.
    await setActiveSpaceId(spaceId);
  };

  if (!activeSpace || spaces.length <= 1) return null;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t.switchSpace}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: tokens.surfaceAlt,
            borderColor: tokens.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name={spaceIconName(activeSpace)}
          size={16}
          color={tokens.text}
        />
        <Text
          numberOfLines={1}
          style={[styles.triggerLabel, { color: tokens.text }]}
        >
          {spaceDisplayName(activeSpace)}
        </Text>
        <Ionicons name="chevron-down" size={14} color={tokens.textMuted} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={[
              styles.card,
              { backgroundColor: tokens.surface, borderColor: tokens.border },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: tokens.text }]}>
                  {t.switchSpace}
                </Text>
                <Text style={[styles.subtitle, { color: tokens.textMuted }]}>
                  {t.switchSpaceHint}
                </Text>
              </View>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={tokens.textMuted} />
              </Pressable>
            </View>

            <View style={styles.list}>
              {spaces.map((space) => {
                const active = space.id === activeSpaceId;
                return (
                  <Pressable
                    key={space.id}
                    onPress={() => void switchToSpace(space.id)}
                    style={({ pressed }) => [
                      styles.option,
                      {
                        backgroundColor: active
                          ? tokens.primary
                          : tokens.surfaceAlt,
                        borderColor: active ? tokens.primary : tokens.border,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.optionIcon,
                        {
                          backgroundColor: active
                            ? 'rgba(255,255,255,0.18)'
                            : tokens.surface,
                        },
                      ]}
                    >
                      <Ionicons
                        name={spaceIconName(space)}
                        size={20}
                        color={active ? tokens.primaryText : tokens.text}
                      />
                    </View>
                    <Text
                      style={[
                        styles.optionLabel,
                        { color: active ? tokens.primaryText : tokens.text },
                      ]}
                    >
                      {spaceDisplayName(space)}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={22}
                        color={tokens.primaryText}
                      />
                    ) : (
                      <View style={styles.optionSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 168,
  },
  triggerLabel: {
    fontWeight: '600',
    fontSize: 14,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    maxWidth: 400,
    width: '100%',
    overflow: 'hidden',
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    paddingHorizontal: 12,
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  optionSpacer: {
    width: 22,
  },
});
