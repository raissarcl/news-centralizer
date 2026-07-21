import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import type { TimelineFilter } from '@/types';

const FILTERS: TimelineFilter[] = ['all', 'unread', 'read', 'starred'];

type Props = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  timelineFilter: TimelineFilter;
  onFilterChange: (filter: TimelineFilter) => void;
  hasSecondaryFilters: boolean;
  activeFilterSummary: string;
  onOpenFilters: () => void;
  onClearSecondary: () => void;
};

function filterLabel(f: TimelineFilter) {
  if (f === 'all') return t.all;
  if (f === 'unread') return t.unread;
  if (f === 'read') return t.readItems;
  return t.starred;
}

export function FeedItemListToolbar({
  searchQuery,
  onSearchChange,
  timelineFilter,
  onFilterChange,
  hasSecondaryFilters,
  activeFilterSummary,
  onOpenFilters,
  onClearSecondary,
}: Props) {
  const { tokens } = useTheme();

  return (
    <View style={styles.toolbar}>
      <View style={styles.searchRow}>
        <View
          style={[
            styles.searchField,
            styles.flexInput,
            {
              backgroundColor: tokens.surfaceAlt,
              borderColor: tokens.border,
            },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={tokens.textFaint} />
          <TextInput
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder={t.search}
            placeholderTextColor={tokens.textFaint}
            returnKeyType="search"
            style={[styles.searchInput, { color: tokens.text }]}
          />
          {searchQuery ? (
            <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={18}
                color={tokens.textFaint}
              />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={onOpenFilters}
          hitSlop={8}
          accessibilityLabel={t.timelineFilters}
          style={[
            styles.filterBtn,
            {
              backgroundColor: hasSecondaryFilters
                ? tokens.primary
                : tokens.surfaceAlt,
              borderColor: tokens.border,
            },
          ]}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={hasSecondaryFilters ? tokens.primaryText : tokens.textMuted}
          />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.segmentScroll,
          { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
        ]}
      >
        {FILTERS.map((f) => {
          const active = timelineFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => onFilterChange(f)}
              accessibilityRole="button"
              accessibilityLabel={filterLabel(f)}
              style={[
                styles.segmentItem,
                active && { backgroundColor: tokens.surface },
              ]}
            >
              <Text
                style={{
                  color: active ? tokens.text : tokens.textMuted,
                  fontSize: 13,
                  fontWeight: active ? '600' : '400',
                }}
                numberOfLines={1}
              >
                {filterLabel(f)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {hasSecondaryFilters ? (
        <Pressable
          onPress={onClearSecondary}
          style={[
            styles.activeBanner,
            { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
          ]}
        >
          <Text
            style={{ color: tokens.textMuted, fontSize: 13, flex: 1 }}
            numberOfLines={1}
          >
            {activeFilterSummary}
          </Text>
          <Ionicons name="close-circle" size={18} color={tokens.textFaint} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { padding: 12, gap: 10 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flexInput: { flex: 1 },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 15,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentScroll: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segmentItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
});
