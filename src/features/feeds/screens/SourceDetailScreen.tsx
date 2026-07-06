import { useLayoutEffect, useMemo } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { FeedItemRow, openItemLink } from '@/features/timeline/components/FeedItemRow';
import { feedInFolder } from '@/lib/feeds/feedFolders';
import { filterItemsForFeed, useFeedsStore } from '@/store/feeds';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import { resolveFeedFavicon } from '@/lib/favicon';

export function SourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { tokens } = useTheme();
  const feeds = useFeedsStore((s) => s.feeds);
  const folders = useFeedsStore((s) => s.folders);
  const tags = useFeedsStore((s) => s.tags);
  const items = useFeedsStore((s) => s.items);
  const refreshing = useFeedsStore((s) => s.refreshing);
  const markItemRead = useFeedsStore((s) => s.markItemRead);
  const toggleItemStarred = useFeedsStore((s) => s.toggleItemStarred);
  const assignTagsToFeed = useFeedsStore((s) => s.assignTagsToFeed);
  const refreshFeed = useFeedsStore((s) => s.refreshFeed);
  const toggleFeedFolder = useFeedsStore((s) => s.toggleFeedFolder);

  const feed = feeds.find((f) => f.id === id);
  const sourceItems = useMemo(
    () => filterItemsForFeed(items, id!),
    [items, id]
  );

  const lastFetchedLabel = useMemo(() => {
    if (!feed?.lastFetchedAt) return t.neverFetched;
    try {
      return `${t.lastFetched}: ${format(parseISO(feed.lastFetchedAt), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}`;
    } catch {
      return `${t.lastFetched}: ${feed.lastFetchedAt}`;
    }
  }, [feed?.lastFetchedAt]);

  useLayoutEffect(() => {
    if (!feed) return;
    navigation.setOptions({
      title: feed.title,
      headerRight: () => (
        <Pressable
          onPress={() => void refreshFeed(feed.id)}
          hitSlop={12}
          style={{ paddingHorizontal: 12 }}
          disabled={refreshing}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={tokens.primary} />
          ) : (
            <Text style={{ color: tokens.primary, fontSize: 14 }}>{t.refreshFeed}</Text>
          )}
        </Pressable>
      ),
    });
  }, [feed, navigation, refreshFeed, refreshing, tokens.primary]);

  if (!feed) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.textMuted }}>{t.noSources}</Text>
      </View>
    );
  }

  const favicon = resolveFeedFavicon(feed);

  return (
    <FlatList
      style={{ backgroundColor: tokens.bg }}
      data={sourceItems}
      keyExtractor={(item) => item.id}
      windowSize={11}
      removeClippedSubviews={false}
      ListHeaderComponent={
        <View style={[styles.header, { borderColor: tokens.border }]}>
          {favicon ? (
            <Image source={{ uri: favicon }} style={styles.favicon} />
          ) : null}
          <Text style={[styles.url, { color: tokens.textMuted }]}>{feed.url}</Text>
          <Text style={[styles.meta, { color: tokens.textFaint }]}>
            {lastFetchedLabel}
          </Text>
          <Text style={[styles.meta, { color: tokens.textMuted, marginTop: 8 }]}>
            {t.feedFolders}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tagsRow}>
              {folders.map((folder) => {
                const active = feedInFolder(feed, folder.id);
                return (
                  <Pressable
                    key={folder.id}
                    onPress={() => {
                      void toggleFeedFolder(feed.id, folder.id).then((ok) => {
                        if (!ok && active) {
                          Alert.alert(t.appName, t.feedMustStayInFolder);
                        }
                      });
                    }}
                    style={[
                      styles.tagChip,
                      {
                        backgroundColor: active ? tokens.primary : tokens.surfaceAlt,
                        borderColor: tokens.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? tokens.primaryText : tokens.textMuted,
                        fontSize: 12,
                      }}
                    >
                      {folder.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <Text style={[styles.meta, { color: tokens.textMuted, marginTop: 8 }]}>
            {t.tags}
          </Text>
          <View style={styles.tagsRow}>
            {tags.map((tag) => {
              const active = feed.tagIds.includes(tag.id);
              return (
                <Pressable
                  key={tag.id}
                  onPress={() => {
                    const next = active
                      ? feed.tagIds.filter((tId) => tId !== tag.id)
                      : [...feed.tagIds, tag.id];
                    void assignTagsToFeed(feed.id, next);
                  }}
                  style={[
                    styles.tagChip,
                    {
                      backgroundColor: active ? tokens.primary : tokens.surfaceAlt,
                      borderColor: tokens.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? tokens.primaryText : tokens.textMuted,
                      fontSize: 12,
                    }}
                  >
                    {tag.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={{ color: tokens.textMuted }}>{t.noItems}</Text>
        </View>
      }
      renderItem={({ item }) => (
        <FeedItemRow
          item={item}
          feed={feed}
          onOpen={async (_itemId, link) => {
            await openItemLink(link);
          }}
          onToggleStar={toggleItemStarred}
          onToggleRead={(id, read) => void markItemRead(id, read)}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  favicon: { width: 32, height: 32, borderRadius: 6 },
  url: { fontSize: 12 },
  meta: { fontSize: 12 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  empty: { padding: 32, alignItems: 'center' },
});
