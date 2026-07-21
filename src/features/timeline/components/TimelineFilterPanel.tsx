import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { periodLabel } from '@/lib/feeds/filterLabels';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';
import type { FeedSource, Folder, Tag, TimelinePeriod } from '@/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  timelinePeriod: TimelinePeriod;
  selectedFolderId: string | null;
  selectedTagId: string | null;
  selectedFeedIds: string[];
  folders: Folder[];
  tags: Tag[];
  feeds: FeedSource[];
  onPeriodChange: (period: TimelinePeriod) => void;
  onFolderChange: (folderId: string | null) => void;
  onTagChange: (tagId: string | null) => void;
  onFeedChange: (feedIds: string[]) => void;
  onClearSecondary: () => void;
  hideFolderSection?: boolean;
};

const PERIODS: TimelinePeriod[] = ['all', 'today', '24h', '7d', '30d', '90d'];

export function TimelineFilterPanel({
  visible,
  onClose,
  timelinePeriod,
  selectedFolderId,
  selectedTagId,
  selectedFeedIds,
  folders,
  tags,
  feeds,
  onPeriodChange,
  onFolderChange,
  onTagChange,
  onFeedChange,
  onClearSecondary,
  hideFolderSection = false,
}: Props) {
  const { tokens } = useTheme();
  const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedFeeds = [...feeds]
    .filter((f) => f.enabled)
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));

  const hasSecondary =
    timelinePeriod !== 'all' ||
    (!hideFolderSection && selectedFolderId !== null) ||
    selectedTagId !== null ||
    selectedFeedIds.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: tokens.surface, borderColor: tokens.border },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: tokens.text }]}>
              {t.timelineFilters}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={tokens.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sectionLabel, { color: tokens.textMuted }]}>
              {t.filterPeriod}
            </Text>
            <View style={styles.chipRow}>
              {PERIODS.map((p) => {
                const active = timelinePeriod === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => onPeriodChange(p)}
                    style={[
                      styles.chip,
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
                        fontSize: 13,
                      }}
                    >
                      {periodLabel(p)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {sortedFolders.length > 0 && !hideFolderSection ? (
              <>
                <Text
                  style={[styles.sectionLabel, { color: tokens.textMuted }]}
                >
                  {t.filterFolder}
                </Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => onFolderChange(null)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: !selectedFolderId
                          ? tokens.primary
                          : tokens.surfaceAlt,
                        borderColor: tokens.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: !selectedFolderId
                          ? tokens.primaryText
                          : tokens.textMuted,
                        fontSize: 13,
                      }}
                    >
                      {t.all}
                    </Text>
                  </Pressable>
                  {sortedFolders.map((folder) => {
                    const active = selectedFolderId === folder.id;
                    return (
                      <Pressable
                        key={folder.id}
                        onPress={() =>
                          onFolderChange(active ? null : folder.id)
                        }
                        style={[
                          styles.chip,
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
                            color: active
                              ? tokens.primaryText
                              : tokens.textMuted,
                            fontSize: 13,
                          }}
                        >
                          {folder.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {sortedFeeds.length > 0 ? (
              <>
                <Text
                  style={[styles.sectionLabel, { color: tokens.textMuted }]}
                >
                  {t.filterFeed}
                </Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => onFeedChange([])}
                    style={[
                      styles.chip,
                      {
                        backgroundColor:
                          selectedFeedIds.length === 0
                            ? tokens.primary
                            : tokens.surfaceAlt,
                        borderColor: tokens.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          selectedFeedIds.length === 0
                            ? tokens.primaryText
                            : tokens.textMuted,
                        fontSize: 13,
                      }}
                    >
                      {t.all}
                    </Text>
                  </Pressable>
                  {sortedFeeds.map((feed) => {
                    const active = selectedFeedIds.includes(feed.id);
                    return (
                      <Pressable
                        key={feed.id}
                        onPress={() =>
                          onFeedChange(
                            active
                              ? selectedFeedIds.filter((id) => id !== feed.id)
                              : [...selectedFeedIds, feed.id],
                          )
                        }
                        style={[
                          styles.chip,
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
                            color: active
                              ? tokens.primaryText
                              : tokens.textMuted,
                            fontSize: 13,
                          }}
                          numberOfLines={1}
                        >
                          {feed.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            {tags.length > 0 ? (
              <>
                <Text
                  style={[styles.sectionLabel, { color: tokens.textMuted }]}
                >
                  {t.filterTag}
                </Text>
                <View style={styles.chipRow}>
                  <Pressable
                    onPress={() => onTagChange(null)}
                    style={[
                      styles.chip,
                      {
                        backgroundColor: !selectedTagId
                          ? tokens.primary
                          : tokens.surfaceAlt,
                        borderColor: tokens.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: !selectedTagId
                          ? tokens.primaryText
                          : tokens.textMuted,
                        fontSize: 13,
                      }}
                    >
                      {t.all}
                    </Text>
                  </Pressable>
                  {tags.map((tag) => {
                    const active = selectedTagId === tag.id;
                    return (
                      <Pressable
                        key={tag.id}
                        onPress={() => onTagChange(active ? null : tag.id)}
                        style={[
                          styles.chip,
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
                            color: active
                              ? tokens.primaryText
                              : tokens.textMuted,
                            fontSize: 13,
                          }}
                        >
                          {tag.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {hasSecondary ? (
              <Pressable onPress={onClearSecondary}>
                <Text style={{ color: tokens.danger, fontSize: 14 }}>
                  {t.clearFilters}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={[styles.doneBtn, { backgroundColor: tokens.primary }]}
            >
              <Text style={{ color: tokens.primaryText, fontWeight: '600' }}>
                {t.done}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    maxHeight: '80%',
    overflow: 'hidden',
    paddingBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 16, maxHeight: 400 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 12,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  doneBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginLeft: 'auto',
  },
});
