import { useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { feedInFolder, isInboxFolderId } from '@/lib/feeds/feedFolders';
import {
  countUnreadInFolder,
  foldersInSpace,
  useFeedsStore,
} from '@/store/feeds';
import { useSettingsStore } from '@/store/settings';
import { resolveActiveSpaceId } from '@/lib/spaces';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';

export default function FoldersScreen() {
  const { tokens } = useTheme();
  const router = useRouter();
  const allFolders = useFeedsStore((s) => s.folders);
  const feeds = useFeedsStore((s) => s.feeds);
  const items = useFeedsStore((s) => s.items);
  const spaces = useFeedsStore((s) => s.spaces);
  const removeFolder = useFeedsStore((s) => s.removeFolder);
  const activeSpaceId = useSettingsStore((s) =>
    resolveActiveSpaceId(s.settings.activeSpaceId, spaces),
  );

  const folders = useMemo(
    () => foldersInSpace(allFolders, activeSpaceId),
    [allFolders, activeSpaceId],
  );

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.sortOrder - b.sortOrder),
    [folders],
  );

  const confirmDeleteFolder = (folderId: string, folderName: string) => {
    if (isInboxFolderId(folderId)) return;
    Alert.alert(folderName, t.deleteFolderConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => void removeFolder(folderId),
      },
    ]);
  };

  const openFolderActions = (folderId: string, folderName: string) => {
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.manageFolderFeeds,
        onPress: () => router.push(`/folder/${folderId}/feeds`),
      },
    ];
    if (!isInboxFolderId(folderId)) {
      buttons.push({
        text: t.renameFolder,
        onPress: () => router.push(`/folder/${folderId}/settings`),
      });
      buttons.push({
        text: t.deleteFolder,
        style: 'destructive',
        onPress: () => confirmDeleteFolder(folderId, folderName),
      });
    }
    Alert.alert(folderName, undefined, buttons);
  };

  if (sortedFolders.length === 0) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.textMuted }}>{t.noFolders}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      data={sortedFolders}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const feedCount = feeds.filter((f) => feedInFolder(f, item.id)).length;
        const unread = countUnreadInFolder(item.id, feeds, items);
        return (
          <Pressable
            onPress={() => router.push(`/folder/${item.id}`)}
            onLongPress={() => openFolderActions(item.id, item.name)}
            style={({ pressed }) => [
              styles.row,
              {
                backgroundColor: tokens.surface,
                borderColor: tokens.border,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View
              style={[styles.iconWrap, { backgroundColor: tokens.surfaceAlt }]}
            >
              <Ionicons
                name="folder-outline"
                size={22}
                color={tokens.primary}
              />
            </View>
            <View style={styles.main}>
              <Text style={[styles.title, { color: tokens.text }]}>
                {item.name}
              </Text>
              <Text style={[styles.sub, { color: tokens.textMuted }]}>
                {t.feedsCount(feedCount)} · {t.unreadCount(unread)}
              </Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={18}
              color={tokens.textFaint}
            />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
