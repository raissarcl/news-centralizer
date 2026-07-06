import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { FeedItemRow, openItemLink } from '../components/FeedItemRow';
import { FeedItemListToolbar } from '../components/FeedItemListToolbar';
import { TimelineFilterPanel } from '../components/TimelineFilterPanel';
import { buildActiveFilterSummary } from '@/lib/feeds/filterLabels';
import { selectVisibleItems, useFeedsStore } from '@/store/feeds';
import { useSettingsStore } from '@/store/settings';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import { notifyNewItems } from '@/lib/notifications';

export function TimelineScreen() {
  const { tokens } = useTheme();
  const items = useFeedsStore((s) => s.items);
  const feeds = useFeedsStore((s) => s.feeds);
  const folders = useFeedsStore((s) => s.folders);
  const timelineFilter = useFeedsStore((s) => s.timelineFilter);
  const timelinePeriod = useFeedsStore((s) => s.timelinePeriod);
  const searchQuery = useFeedsStore((s) => s.searchQuery);
  const selectedTagId = useFeedsStore((s) => s.selectedTagId);
  const selectedFolderId = useFeedsStore((s) => s.selectedFolderId);
  const selectedFeedIds = useFeedsStore((s) => s.selectedFeedIds);
  const refreshing = useFeedsStore((s) => s.refreshing);
  const refreshProgress = useFeedsStore((s) => s.refreshProgress);
  const refreshAll = useFeedsStore((s) => s.refreshAll);
  const markItemRead = useFeedsStore((s) => s.markItemRead);
  const toggleItemStarred = useFeedsStore((s) => s.toggleItemStarred);
  const setTimelineFilter = useFeedsStore((s) => s.setTimelineFilter);
  const setTimelinePeriod = useFeedsStore((s) => s.setTimelinePeriod);
  const setSearchQuery = useFeedsStore((s) => s.setSearchQuery);
  const tags = useFeedsStore((s) => s.tags);
  const setSelectedTagId = useFeedsStore((s) => s.setSelectedTagId);
  const setSelectedFolderId = useFeedsStore((s) => s.setSelectedFolderId);
  const setSelectedFeedIds = useFeedsStore((s) => s.setSelectedFeedIds);
  const notifyOnNewItems = useSettingsStore((s) => s.settings.notifyOnNewItems);

  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const visibleItems = useMemo(
    () =>
      selectVisibleItems({
        items,
        feeds,
        timelineFilter,
        timelinePeriod,
        searchQuery,
        selectedTagId,
        selectedFolderId,
        selectedFeedIds,
      }),
    [
      items,
      feeds,
      timelineFilter,
      timelinePeriod,
      searchQuery,
      selectedTagId,
      selectedFolderId,
      selectedFeedIds,
    ]
  );

  const feedById = useMemo(
    () => new Map(feeds.map((f) => [f.id, f])),
    [feeds]
  );

  const hasSecondaryFilters =
    timelinePeriod !== 'all' ||
    selectedFolderId !== null ||
    selectedTagId !== null ||
    selectedFeedIds.length > 0;

  const activeFilterSummary = useMemo(
    () =>
      buildActiveFilterSummary({
        timelinePeriod,
        selectedFolderId,
        selectedTagId,
        selectedFeedIds,
        folders,
        tags,
        feeds,
      }),
    [
      timelinePeriod,
      selectedFolderId,
      selectedTagId,
      selectedFeedIds,
      folders,
      tags,
      feeds,
    ]
  );

  const onRefresh = useCallback(async () => {
    setLocalRefreshing(true);
    try {
      const { newCount, newHeadlines } = await refreshAll();
      if (notifyOnNewItems) {
        await notifyNewItems(newCount, newHeadlines);
      }
    } finally {
      setLocalRefreshing(false);
    }
  }, [refreshAll, notifyOnNewItems]);

  const handleOpen = async (_itemId: string, link: string) => {
    await openItemLink(link);
  };

  const clearSecondaryFilters = () => {
    setTimelinePeriod('all');
    setSelectedFolderId(null);
    setSelectedTagId(null);
    setSelectedFeedIds([]);
  };

  const isDefaultView =
    timelineFilter === 'all' &&
    !searchQuery &&
    !selectedFolderId &&
    timelinePeriod === 'all' &&
    !selectedTagId &&
    selectedFeedIds.length === 0;

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
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
        selectedFolderId={selectedFolderId}
        selectedTagId={selectedTagId}
        selectedFeedIds={selectedFeedIds}
        folders={folders}
        tags={tags}
        feeds={feeds}
        onPeriodChange={setTimelinePeriod}
        onFolderChange={setSelectedFolderId}
        onTagChange={setSelectedTagId}
        onFeedChange={setSelectedFeedIds}
        onClearSecondary={clearSecondaryFilters}
      />

      {(refreshing || localRefreshing) && refreshProgress ? (
        <View style={[styles.progressBar, { backgroundColor: tokens.surfaceAlt }]}>
          <Text style={{ color: tokens.textMuted, fontSize: 12 }}>
            {t.refreshProgress(refreshProgress.done, refreshProgress.total)}
          </Text>
        </View>
      ) : null}

      <FlatList
        data={visibleItems}
        keyExtractor={(item) => item.id}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={11}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing || localRefreshing}
            onRefresh={onRefresh}
            tintColor={tokens.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            {refreshing ? (
              <ActivityIndicator color={tokens.primary} />
            ) : (
              <Text style={{ color: tokens.textMuted, textAlign: 'center' }}>
                {isDefaultView ? t.noItems : t.noItemsFiltered}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <FeedItemRow
            item={item}
            feed={feedById.get(item.feedId)}
            onOpen={handleOpen}
            onToggleStar={toggleItemStarred}
            onToggleRead={(id, read) => void markItemRead(id, read)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  progressBar: { paddingHorizontal: 16, paddingVertical: 6 },
  empty: { padding: 32, alignItems: 'center' },
});
