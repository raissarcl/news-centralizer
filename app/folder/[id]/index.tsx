import { FeedItemListToolbar } from '@/features/timeline/components/FeedItemListToolbar';
import {
  FeedItemRow,
  openItemLink,
} from '@/features/timeline/components/FeedItemRow';
import { TimelineFilterPanel } from '@/features/timeline/components/TimelineFilterPanel';
import { feedInFolder, isInboxFolderId } from '@/lib/feeds/feedFolders';
import { buildActiveFilterSummary } from '@/lib/feeds/filterLabels';
import { t } from '@/lib/i18n';
import {
  countUnreadInFolder,
  selectVisibleItems,
  useFeedsStore,
} from '@/store/feeds';
import { useTheme } from '@/theme';
import type { TimelineFilter, TimelinePeriod } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';

export default function FolderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { tokens } = useTheme();
  const folders = useFeedsStore((s) => s.folders);
  const feeds = useFeedsStore((s) => s.feeds);
  const items = useFeedsStore((s) => s.items);
  const tags = useFeedsStore((s) => s.tags);
  const markItemRead = useFeedsStore((s) => s.markItemRead);
  const toggleItemStarred = useFeedsStore((s) => s.toggleItemStarred);
  const refreshAll = useFeedsStore((s) => s.refreshAll);
  const refreshing = useFeedsStore((s) => s.refreshing);
  const markAllReadInFolder = useFeedsStore((s) => s.markAllReadInFolder);

  const [searchQuery, setSearchQuery] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
  const [timelinePeriod, setTimelinePeriod] = useState<TimelinePeriod>('all');
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [selectedFeedIds, setSelectedFeedIds] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const folder = folders.find((f) => f.id === id);

  const folderFeeds = useMemo(
    () => feeds.filter((f) => feedInFolder(f, id!)),
    [feeds, id],
  );

  const spaceTags = useMemo(
    () =>
      folder ? tags.filter((tag) => tag.spaceId === folder.spaceId) : tags,
    [tags, folder],
  );

  const visibleItems = useMemo(
    () =>
      folder
        ? selectVisibleItems({
            items,
            feeds,
            timelineFilter,
            timelinePeriod,
            searchQuery,
            selectedTagId,
            selectedFolderId: folder.id,
            selectedFeedIds,
            spaceId: folder.spaceId,
          })
        : [],
    [
      folder,
      items,
      feeds,
      timelineFilter,
      timelinePeriod,
      searchQuery,
      selectedTagId,
      selectedFeedIds,
    ],
  );

  const unread = useMemo(
    () => (folder ? countUnreadInFolder(folder.id, feeds, items) : 0),
    [folder, feeds, items],
  );

  const feedById = useMemo(() => new Map(feeds.map((f) => [f.id, f])), [feeds]);

  const hasSecondaryFilters =
    timelinePeriod !== 'all' ||
    selectedTagId !== null ||
    selectedFeedIds.length > 0;

  const activeFilterSummary = useMemo(
    () =>
      buildActiveFilterSummary({
        timelinePeriod,
        selectedTagId,
        selectedFeedIds,
        tags: spaceTags,
        feeds: folderFeeds,
      }),
    [timelinePeriod, selectedTagId, selectedFeedIds, spaceTags, folderFeeds],
  );

  const clearSecondaryFilters = () => {
    setTimelinePeriod('all');
    setSelectedTagId(null);
    setSelectedFeedIds([]);
  };

  const hasActiveFilters =
    timelineFilter !== 'all' ||
    !!searchQuery ||
    timelinePeriod !== 'all' ||
    selectedTagId !== null ||
    selectedFeedIds.length > 0;

  const openFolderMenu = useCallback(() => {
    if (!folder) return;
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.manageFolderFeeds,
        onPress: () => router.push(`/folder/${folder.id}/feeds`),
      },
    ];
    if (!isInboxFolderId(folder.id)) {
      buttons.push({
        text: t.folderSettings,
        onPress: () => router.push(`/folder/${folder.id}/settings`),
      });
    }
    Alert.alert(folder.name, undefined, buttons);
  }, [folder, router]);

  useLayoutEffect(() => {
    if (!folder) return;
    navigation.setOptions({
      title: folder.name,
      headerRight: () => (
        <View style={styles.headerActions}>
          {unread > 0 ? (
            <Pressable
              onPress={() => void markAllReadInFolder(folder.id)}
              hitSlop={8}
              style={{ paddingHorizontal: 8 }}
            >
              <Text style={{ color: tokens.primary, fontSize: 14 }}>
                {t.markAllRead}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={openFolderMenu}
            hitSlop={8}
            style={{ paddingHorizontal: 8 }}
          >
            <Ionicons
              name="ellipsis-horizontal"
              size={20}
              color={tokens.text}
            />
          </Pressable>
        </View>
      ),
    });
  }, [
    folder,
    navigation,
    markAllReadInFolder,
    unread,
    tokens.primary,
    tokens.text,
    openFolderMenu,
  ]);

  if (!folder) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.textMuted }}>{t.noFolders}</Text>
      </View>
    );
  }

  const listHeader = (
    <View
      style={[
        styles.banner,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <View style={styles.bannerText}>
        <Text style={{ color: tokens.textMuted, fontSize: 13 }}>
          {t.feedsCount(folderFeeds.length)} · {t.unreadCount(unread)}
        </Text>
        {folder.retentionDays ? (
          <Text style={{ color: tokens.textFaint, fontSize: 12, marginTop: 2 }}>
            {t.folderRetention(folder.retentionDays)}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => router.push(`/folder/${folder.id}/feeds`)}
        style={[
          styles.manageBtn,
          { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
        ]}
      >
        <Ionicons name="globe-outline" size={16} color={tokens.primary} />
        <Text
          style={{ color: tokens.primary, fontSize: 13, fontWeight: '500' }}
        >
          {t.manageFolderFeeds}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <FeedItemListToolbar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        timelineFilter={timelineFilter}
        onFilterChange={setTimelineFilter}
        hasSecondaryFilters={hasSecondaryFilters}
        activeFilterSummary={activeFilterSummary}
        onOpenFilters={() => setFiltersOpen(true)}
        onClearSecondary={clearSecondaryFilters}
      />

      <TimelineFilterPanel
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        timelinePeriod={timelinePeriod}
        selectedFolderId={null}
        selectedTagId={selectedTagId}
        selectedFeedIds={selectedFeedIds}
        folders={folders.filter((f) => f.spaceId === folder.spaceId)}
        tags={spaceTags}
        feeds={folderFeeds}
        onPeriodChange={setTimelinePeriod}
        onFolderChange={() => {}}
        onTagChange={setSelectedTagId}
        onFeedChange={setSelectedFeedIds}
        onClearSecondary={clearSecondaryFilters}
        hideFolderSection
      />

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        windowSize={11}
        removeClippedSubviews={false}
        ListHeaderComponent={listHeader}
        contentContainerStyle={
          visibleItems.length === 0 ? styles.emptyList : undefined
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text
              style={{
                color: tokens.textMuted,
                textAlign: 'center',
                marginBottom: 12,
              }}
            >
              {hasActiveFilters ? t.noItemsFiltered : t.noItemsInFolder}
            </Text>
            {!hasActiveFilters ? (
              <Pressable
                onPress={() => void refreshAll()}
                disabled={refreshing}
                style={[styles.refreshBtn, { backgroundColor: tokens.primary }]}
              >
                <Text style={{ color: tokens.primaryText, fontWeight: '600' }}>
                  {refreshing ? t.refreshing : t.pullToRefresh}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <FeedItemRow
            item={item}
            feed={feedById.get(item.feedId)}
            onOpen={async (_itemId, link) => {
              await openItemLink(link);
            }}
            onToggleStar={toggleItemStarred}
            onToggleRead={(id, read) => void markItemRead(id, read)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    margin: 12,
    marginBottom: 4,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerText: { flex: 1 },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  emptyList: { flexGrow: 1 },
  empty: { padding: 32, alignItems: 'center' },
  refreshBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
});
