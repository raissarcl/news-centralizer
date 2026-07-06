import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeedsStore } from '@/store/feeds';
import { useSettingsStore } from '@/store/settings';
import { useTheme, getSwitchProps } from '@/theme';
import { t } from '@/lib/i18n';
import { resolveFeedFavicon } from '@/lib/favicon';
import { FeedFolderMembershipSwitch } from '@/features/feeds/components/FeedFolderMembershipSwitch';
import { formatFeedFolderNames } from '@/lib/feeds/feedFolders';
import { feedHostLabel } from '@/lib/feeds/feedHostLabel';
import { computeFeedHealth, isFeedPausedNow } from '@/lib/feeds/feedHealth';
import { isRssHubUrl, suggestRssHubUrl } from '@/lib/rsshub';
import { validateFeedUrl, feedUrlErrorMessage, type UrlValidationError } from '@/lib/security/urls';
import type { FeedSource } from '@/types';

function urlValidationMessage(error: UrlValidationError): string {
  switch (feedUrlErrorMessage(error)) {
    case 'invalidFeedUrlScheme':
      return t.invalidFeedUrlScheme;
    case 'invalidFeedUrlPrivate':
      return t.invalidFeedUrlPrivate;
    case 'invalidFeedUrlTooLong':
      return t.invalidFeedUrlTooLong;
    case 'invalidFeedUrlCredentials':
      return t.invalidFeedUrlCredentials;
    default:
      return t.invalidFeedUrl;
  }
}

export function SourcesScreen() {
  const { tokens } = useTheme();
  const switchProps = getSwitchProps(tokens);
  const router = useRouter();
  const { addToFolder } = useLocalSearchParams<{ addToFolder?: string }>();
  const feeds = useFeedsStore((s) => s.feeds);
  const folders = useFeedsStore((s) => s.folders);
  const toggleFeedEnabled = useFeedsStore((s) => s.toggleFeedEnabled);
  const addFeed = useFeedsStore((s) => s.addFeed);
  const removeFeed = useFeedsStore((s) => s.removeFeed);
  const resumeFeed = useFeedsStore((s) => s.resumeFeed);
  const resumeAllPausedFeeds = useFeedsStore((s) => s.resumeAllPausedFeeds);
  const updateSettings = useSettingsStore((s) => s.update);
  const rssHubAcknowledged = useSettingsStore((s) => s.settings.rssHubAcknowledged);

  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [folderId, setFolderId] = useState('');
  const [folderFilterId, setFolderFilterId] = useState<string | null>(null);

  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders]
  );

  const sortedFolders = useMemo(
    () => [...folders].sort((a, b) => a.sortOrder - b.sortOrder),
    [folders]
  );

  const sortedFeeds = useMemo(
    () => [...feeds].sort((a, b) => a.title.localeCompare(b.title, 'pt-BR')),
    [feeds]
  );

  const health = useMemo(() => computeFeedHealth(feeds), [feeds]);
  const hasHealthIssues = health.errors > 0 || health.paused > 0;

  const filteredFolder = folderFilterId ? folderById.get(folderFilterId) : undefined;
  const selectedFolderId = folderId || folderFilterId || sortedFolders[0]?.id || 'inbox';
  const addButtonLabel = filteredFolder
    ? t.addFeedToFolder(filteredFolder.name)
    : t.addFeed;

  useEffect(() => {
    if (!addToFolder || typeof addToFolder !== 'string') return;
    setFolderFilterId(addToFolder);
    setFolderId(addToFolder);
    setShowForm(true);
    router.setParams({ addToFolder: '' });
  }, [addToFolder, router]);

  const openAddForm = () => {
    if (folderFilterId) setFolderId(folderFilterId);
    setShowForm(true);
  };

  const handleAdd = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const precheck = validateFeedUrl(trimmedUrl, {
      allowHttp: useSettingsStore.getState().settings.allowHttpFeeds,
    });
    if (!precheck.ok) {
      Alert.alert(t.appName, urlValidationMessage(precheck.error));
      return;
    }

    if (isRssHubUrl(trimmedUrl) && !rssHubAcknowledged) {
      Alert.alert(t.rssHubWarningTitle, t.rssHubWarningBody, [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.save,
          onPress: () => {
            void updateSettings({ rssHubAcknowledged: true });
            void submitFeed(trimmedUrl);
          },
        },
      ]);
      return;
    }

    await submitFeed(trimmedUrl);
  };

  const submitFeed = async (trimmedUrl: string) => {
    const result = await addFeed({
      title: title.trim() || trimmedUrl,
      url: trimmedUrl,
      folderId: selectedFolderId,
    });
    if (result === 'duplicate') {
      Alert.alert(t.appName, t.feedUrlDuplicate);
      return;
    }
    if (result === 'invalid') {
      Alert.alert(t.appName, t.invalidFeedUrl);
      return;
    }
    setUrl('');
    setTitle('');
    setFolderId('');
    setShowForm(false);
  };

  const applyRssHubSuggestion = () => {
    const suggestion = suggestRssHubUrl(url.trim());
    if (!suggestion) return;
    const validated = validateFeedUrl(suggestion);
    if (validated.ok) setUrl(validated.url.href);
  };

  const confirmRemove = (feedId: string, feedTitle: string) => {
    Alert.alert(feedTitle, t.delete, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => void removeFeed(feedId),
      },
    ]);
  };

  const renderFeedRow = (item: FeedSource) => {
    const folderLabel = formatFeedFolderNames(item, folders);
    const favicon = resolveFeedFavicon(item);
    const showFolderSwitch = Boolean(folderFilterId && filteredFolder);
    return (
      <Pressable
        onPress={() => router.push(`/source/${item.id}`)}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: tokens.surface,
            borderColor: tokens.border,
            opacity: pressed ? 0.85 : 1,
          },
        ]}
      >
        {favicon ? (
          <Image source={{ uri: favicon }} style={styles.favicon} />
        ) : (
          <View style={[styles.faviconPlaceholder, { backgroundColor: tokens.surfaceAlt }]} />
        )}
        <View style={styles.main}>
          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={[styles.sub, { color: tokens.textMuted }]} numberOfLines={1}>
            {folderLabel} · {feedHostLabel(item.url)}
            {isRssHubUrl(item.url) ? ` · ${t.rssHubBadge}` : ''}
          </Text>
          {item.refreshPausedUntil &&
          new Date(item.refreshPausedUntil).getTime() > Date.now() ? (
            <Text style={[styles.error, { color: tokens.textFaint }]}>{t.feedPaused}</Text>
          ) : null}
          {item.lastError ? (
            <Text style={[styles.error, { color: tokens.danger }]}>
              {t.fetchError}: {item.lastError}
            </Text>
          ) : null}
        </View>
        {isFeedPausedNow(item) ? (
          <Pressable onPress={() => void resumeFeed(item.id)} hitSlop={8}>
            <Text style={{ color: tokens.primary, fontSize: 12 }}>{t.resumeFeed}</Text>
          </Pressable>
        ) : null}
        {showFolderSwitch ? (
          <FeedFolderMembershipSwitch
            feedId={item.id}
            folderId={folderFilterId!}
            folderName={filteredFolder!.name}
            switchProps={switchProps}
          />
        ) : null}
        {showFolderSwitch ? (
          <View style={{ alignItems: 'center', gap: 2, minWidth: 56 }}>
            <Switch
              value={item.enabled}
              onValueChange={() => void toggleFeedEnabled(item.id)}
              accessibilityLabel={`${item.title} ${t.enabled}`}
              {...switchProps}
            />
            <Text style={{ color: tokens.textMuted, fontSize: 10, textAlign: 'center' }}>
              {t.enabled}
            </Text>
          </View>
        ) : (
          <Switch
            value={item.enabled}
            onValueChange={() => void toggleFeedEnabled(item.id)}
            accessibilityLabel={`${item.title} ${item.enabled ? t.enabled : t.disabled}`}
            {...switchProps}
          />
        )}
        <Pressable onPress={() => confirmRemove(item.id, item.title)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={tokens.danger} />
        </Pressable>
      </Pressable>
    );
  };

  const listHeader = (
    <View style={styles.header}>
      {showForm ? (
        <View
          style={[
            styles.form,
            { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
          ]}
        >
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder={t.feedUrl}
            placeholderTextColor={tokens.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            style={[
              styles.input,
              { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.surface },
            ]}
          />
          {!isRssHubUrl(url) && suggestRssHubUrl(url) ? (
            <Pressable onPress={applyRssHubSuggestion}>
              <Text style={{ color: tokens.primary, fontSize: 13 }}>{t.useRssHub}</Text>
            </Pressable>
          ) : null}
          <Text style={{ color: tokens.textFaint, fontSize: 12 }}>{t.rssHubHint}</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder={t.feedTitle}
            placeholderTextColor={tokens.textFaint}
            style={[
              styles.input,
              { color: tokens.text, borderColor: tokens.border, backgroundColor: tokens.surface },
            ]}
          />
          <Text style={{ color: tokens.textMuted, fontSize: 13 }}>{t.folder}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.folderRow}>
              {sortedFolders.map((folder) => {
                const active = selectedFolderId === folder.id;
                return (
                  <Pressable
                    key={folder.id}
                    onPress={() => setFolderId(folder.id)}
                    style={[
                      styles.folderChip,
                      {
                        backgroundColor: active ? tokens.primary : tokens.surface,
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
                      {folder.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.formActions}>
            <Pressable onPress={() => setShowForm(false)}>
              <Text style={{ color: tokens.textMuted }}>{t.cancel}</Text>
            </Pressable>
            <Pressable onPress={() => void handleAdd()}>
              <Text style={{ color: tokens.primary, fontWeight: '600' }}>{t.save}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={openAddForm}
          style={[styles.addBtn, { backgroundColor: tokens.primary }]}
        >
          <Ionicons name="add" size={20} color={tokens.primaryText} />
          <Text style={{ color: tokens.primaryText, fontWeight: '600' }}>{addButtonLabel}</Text>
        </Pressable>
      )}

      <Text style={[styles.hint, { color: tokens.textFaint }]}>{t.sourcesHint}</Text>

      {folderFilterId && filteredFolder ? (
        <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.sourcesFolderSwitchHint}</Text>
      ) : null}

      {hasHealthIssues ? (
        <View
          style={[
            styles.healthBanner,
            { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
          ]}
        >
          <Text style={{ color: tokens.textMuted, fontSize: 13, flex: 1 }}>
            {t.feedHealthSummary(health.errors, health.paused)}
          </Text>
          {health.paused > 0 ? (
            <Pressable
              onPress={() => void resumeAllPausedFeeds()}
              style={[styles.resumeBtn, { borderColor: tokens.primary }]}
            >
              <Text style={{ color: tokens.primary, fontSize: 13, fontWeight: '500' }}>
                {t.resumePausedFeeds}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Text style={[styles.filterLabel, { color: tokens.textMuted }]}>{t.filterByFolder}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.folderFilterRow}
      >
        <Pressable
          onPress={() => setFolderFilterId(null)}
          style={[
            styles.folderChip,
            {
              backgroundColor: !folderFilterId ? tokens.primary : tokens.surfaceAlt,
              borderColor: tokens.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={t.all}
        >
          <Text
            style={{
              color: !folderFilterId ? tokens.primaryText : tokens.textMuted,
              fontSize: 13,
            }}
          >
            {t.all}
          </Text>
        </Pressable>
        {sortedFolders.map((folder) => {
          const active = folderFilterId === folder.id;
          return (
            <Pressable
              key={folder.id}
              onPress={() => setFolderFilterId(active ? null : folder.id)}
              style={[
                styles.folderChip,
                {
                  backgroundColor: active ? tokens.primary : tokens.surfaceAlt,
                  borderColor: tokens.border,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={folder.name}
            >
              <Text
                style={{
                  color: active ? tokens.primaryText : tokens.textMuted,
                  fontSize: 13,
                }}
              >
                {folder.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: tokens.bg }]}>
      <FlatList
        data={sortedFeeds}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={listHeader}
        contentContainerStyle={sortedFeeds.length === 0 ? styles.emptyList : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ color: tokens.textMuted, textAlign: 'center', marginBottom: 12 }}>
              {t.noSources}
            </Text>
            {folderFilterId && filteredFolder ? (
              <Pressable
                onPress={openAddForm}
                style={[styles.emptyCta, { backgroundColor: tokens.primary }]}
              >
                <Text style={{ color: tokens.primaryText, fontWeight: '600' }}>
                  {t.addFirstFeedInFolder}
                </Text>
              </Pressable>
            ) : null}
          </View>
        }
        renderItem={({ item }) => renderFeedRow(item)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { padding: 12, gap: 10, paddingBottom: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  form: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  folderRow: { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  folderChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  favicon: { width: 24, height: 24, borderRadius: 4 },
  faviconPlaceholder: { width: 24, height: 24, borderRadius: 4 },
  main: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '600' },
  sub: { fontSize: 12 },
  error: { fontSize: 11 },
  hint: { fontSize: 12 },
  filterLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  healthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  resumeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  folderFilterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
    minHeight: 44,
    alignItems: 'center',
  },
  emptyList: { flexGrow: 1 },
  empty: { padding: 32, alignItems: 'center' },
  emptyCta: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
});
