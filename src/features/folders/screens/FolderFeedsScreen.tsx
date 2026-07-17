import { useLayoutEffect, useMemo } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { FeedFolderMembershipSwitch } from '@/features/feeds/components/FeedFolderMembershipSwitch';
import { formatFeedFolderNames } from '@/lib/feeds/feedFolders';
import { useFeedsStore } from '@/store/feeds';
import { getSwitchProps, useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import { resolveFeedFavicon } from '@/lib/favicon';

export function FolderFeedsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { tokens } = useTheme();
  const switchProps = getSwitchProps(tokens);
  const folders = useFeedsStore((s) => s.folders);
  const feeds = useFeedsStore((s) => s.feeds);

  const folder = folders.find((f) => f.id === id);

  const allFeeds = useMemo(
    () =>
      [...feeds]
        .filter((f) => !folder || f.spaceId === folder.spaceId)
        .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [feeds, folder]
  );

  useLayoutEffect(() => {
    if (folder) {
      navigation.setOptions({ title: folder.name });
    }
  }, [folder, navigation]);

  if (!folder) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.textMuted }}>{t.noFolders}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <FlatList
        data={allFeeds}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.folderFeedsHint}</Text>
        }
        renderItem={({ item: feed }) => {
          const favicon = resolveFeedFavicon(feed);
          return (
            <View
              style={[
                styles.feedRow,
                { borderColor: tokens.border, backgroundColor: tokens.surface },
              ]}
            >
              {favicon ? (
                <Image source={{ uri: favicon }} style={styles.feedFavicon} />
              ) : (
                <View style={[styles.feedFavicon, { backgroundColor: tokens.surfaceAlt }]} />
              )}
              <Pressable
                style={styles.feedMain}
                onPress={() => router.push(`/source/${feed.id}`)}
              >
                <Text style={{ color: tokens.text, fontWeight: '500' }} numberOfLines={2}>
                  {feed.title}
                </Text>
                <Text style={{ color: tokens.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {formatFeedFolderNames(feed, folders)}
                </Text>
              </Pressable>
              <FeedFolderMembershipSwitch
                feedId={feed.id}
                folderId={folder.id}
                folderName={folder.name}
                switchProps={switchProps}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8, paddingBottom: 24 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  feedFavicon: { width: 24, height: 24, borderRadius: 4 },
  feedMain: { flex: 1 },
  empty: { padding: 32, alignItems: 'center' },
});
