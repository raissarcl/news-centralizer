import { useLayoutEffect, useMemo } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  FeedItemRow,
  openItemLink,
} from '@/features/timeline/components/FeedItemRow';
import { feedInFolder } from '@/lib/feeds/feedFolders';
import { filterItemsForFeed, useFeedsStore } from '@/store/feeds';
import { getSwitchProps, useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import { resolveFeedFavicon } from '@/lib/favicon';

export default function SourceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { tokens } = useTheme();
  const switchProps = getSwitchProps(tokens);
  const feeds = useFeedsStore((s) => s.feeds);
  const folders = useFeedsStore((s) => s.folders);
  const tags = useFeedsStore((s) => s.tags);
  const items = useFeedsStore((s) => s.items);
  const feedRefreshing = useFeedsStore((s) =>
    id ? s.refreshingFeedIds.includes(id) : false,
  );
  const markItemRead = useFeedsStore((s) => s.markItemRead);
  const toggleItemStarred = useFeedsStore((s) => s.toggleItemStarred);
  const assignTagsToFeed = useFeedsStore((s) => s.assignTagsToFeed);
  const refreshFeed = useFeedsStore((s) => s.refreshFeed);
  const toggleFeedFolder = useFeedsStore((s) => s.toggleFeedFolder);
  const toggleFeedEnabled = useFeedsStore((s) => s.toggleFeedEnabled);
  const removeFeed = useFeedsStore((s) => s.removeFeed);

  const feed = feeds.find((f) => f.id === id);
  const spaceFolders = useMemo(
    () =>
      folders
        .filter((f) => !feed || f.spaceId === feed.spaceId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [folders, feed],
  );
  const spaceTags = useMemo(
    () => tags.filter((tag) => !feed || tag.spaceId === feed.spaceId),
    [tags, feed],
  );
  const sourceItems = useMemo(
    () => filterItemsForFeed(items, id!),
    [items, id],
  );

  const lastFetchedLabel = useMemo(() => {
    if (!feed?.lastFetchedAt) return t.neverFetched;
    try {
      return `${t.lastFetched}: ${format(parseISO(feed.lastFetchedAt), "d MMM yyyy 'às' HH:mm", { locale: ptBR })}`;
    } catch {
      return `${t.lastFetched}: ${feed.lastFetchedAt}`;
    }
  }, [feed]);

  useLayoutEffect(() => {
    if (!feed) return;
    navigation.setOptions({
      title: feed.title,
      headerRight: () => (
        <Pressable
          onPress={() => void refreshFeed(feed.id)}
          hitSlop={12}
          style={{ paddingHorizontal: 12 }}
          disabled={feedRefreshing}
        >
          {feedRefreshing ? (
            <ActivityIndicator size="small" color={tokens.primary} />
          ) : (
            <Text style={{ color: tokens.primary, fontSize: 14 }}>
              {t.refreshFeed}
            </Text>
          )}
        </Pressable>
      ),
    });
  }, [feed, feedRefreshing, navigation, refreshFeed, tokens.primary]);

  if (!feed) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.textMuted }}>{t.noSources}</Text>
      </View>
    );
  }

  const favicon = resolveFeedFavicon(feed);

  const confirmRemove = () => {
    Alert.alert(feed.title, t.deleteFeedConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => {
          void removeFeed(feed.id).then(() => router.back());
        },
      },
    ]);
  };

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
          <Text style={[styles.url, { color: tokens.textMuted }]}>
            {feed.url}
          </Text>
          <Text style={[styles.meta, { color: tokens.textFaint }]}>
            {lastFetchedLabel}
          </Text>
          <View style={styles.actionsRow}>
            <View style={styles.enabledRow}>
              <Switch
                value={feed.enabled}
                onValueChange={() => void toggleFeedEnabled(feed.id)}
                accessibilityLabel={`${feed.title} ${feed.enabled ? t.enabled : t.disabled}`}
                {...switchProps}
              />
              <Text style={{ color: tokens.text, fontSize: 14 }}>
                {feed.enabled ? t.enabled : t.disabled}
              </Text>
            </View>
            <Pressable onPress={confirmRemove} hitSlop={8}>
              <Text
                style={{
                  color: tokens.danger,
                  fontSize: 14,
                  fontWeight: '600',
                }}
              >
                {t.delete}
              </Text>
            </Pressable>
          </View>
          <Text
            style={[styles.meta, { color: tokens.textMuted, marginTop: 8 }]}
          >
            {t.feedFolders}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tagsRow}>
              {spaceFolders.map((folder) => {
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
                        backgroundColor: active
                          ? tokens.primary
                          : tokens.surfaceAlt,
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
          <Text
            style={[styles.meta, { color: tokens.textMuted, marginTop: 8 }]}
          >
            {t.tags}
          </Text>
          <View style={styles.tagsRow}>
            {spaceTags.map((tag) => {
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
                      backgroundColor: active
                        ? tokens.primary
                        : tokens.surfaceAlt,
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  enabledRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  empty: { padding: 32, alignItems: 'center' },
});
