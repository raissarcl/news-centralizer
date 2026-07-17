import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSettingsStore } from '@/store/settings';
import { tagsInSpace, useFeedsStore } from '@/store/feeds';
import { getSwitchProps, useTheme, type ThemeTokens } from '@/theme';
import { spaceDisplayName, t } from '@/lib/i18n';
import {
  exportBackupJson,
  exportOpml,
  importBackupJson,
  importOpml,
} from '@/lib/backup';
import { resolveActiveSpaceId } from '@/lib/spaces';
import type { ThemeMode } from '@/types';

const THEMES: ThemeMode[] = ['system', 'light', 'dark'];
const MIN_RETENTION = 1;
const MAX_RETENTION = 365;

export function SettingsScreen() {
  const { tokens } = useTheme();
  const switchProps = getSwitchProps(tokens);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const items = useFeedsStore((s) => s.items);
  const feeds = useFeedsStore((s) => s.feeds);
  const spaces = useFeedsStore((s) => s.spaces);
  const addFolder = useFeedsStore((s) => s.addFolder);
  const addTag = useFeedsStore((s) => s.addTag);
  const renameTag = useFeedsStore((s) => s.renameTag);
  const removeTag = useFeedsStore((s) => s.removeTag);
  const allTags = useFeedsStore((s) => s.tags);
  const purgeItemsByRetention = useFeedsStore((s) => s.purgeItemsByRetention);
  const removeReadItems = useFeedsStore((s) => s.removeReadItems);
  const clearAllItems = useFeedsStore((s) => s.clearAllItems);

  const activeSpaceId = resolveActiveSpaceId(settings.activeSpaceId, spaces);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  const tags = useMemo(
    () => tagsInSpace(allTags, activeSpaceId),
    [allTags, activeSpaceId]
  );
  const itemsInActiveSpace = useMemo(() => {
    const feedIds = new Set(
      feeds.filter((f) => f.spaceId === activeSpaceId).map((f) => f.id)
    );
    return items.filter((i) => feedIds.has(i.feedId)).length;
  }, [items, feeds, activeSpaceId]);

  const [folderName, setFolderName] = useState('');
  const [tagName, setTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagEditDraft, setTagEditDraft] = useState('');
  const [retentionDraft, setRetentionDraft] = useState(String(settings.retentionDays));
  const [retentionError, setRetentionError] = useState('');

  useEffect(() => {
    setRetentionDraft(String(settings.retentionDays));
  }, [settings.retentionDays]);

  const themeLabel = (mode: ThemeMode) => {
    if (mode === 'system') return t.themeSystem;
    if (mode === 'light') return t.themeLight;
    return t.themeDark;
  };

  const saveRetention = async () => {
    const n = parseInt(retentionDraft, 10);
    if (Number.isNaN(n) || n < MIN_RETENTION || n > MAX_RETENTION) {
      setRetentionError(t.retentionInvalid);
      return;
    }
    setRetentionError('');
    await update({ retentionDays: n });
    const { removed } = await purgeItemsByRetention();
    Alert.alert(t.appName, t.retentionApplied(removed));
  };

  const handleApplyRetention = async () => {
    const { removed } = await purgeItemsByRetention();
    Alert.alert(t.appName, t.retentionApplied(removed));
  };

  const handleRemoveRead = () => {
    Alert.alert(t.removeReadItems, t.removeReadItemsConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => {
          void removeReadItems().then((removed) => {
            Alert.alert(t.appName, t.itemsRemoved(removed));
          });
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert(t.clearAllItems, t.clearAllItemsConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => void clearAllItems(),
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
    >
      <Section title={t.settingsSectionAppearance} tokens={tokens}>
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>{t.theme}</Text>
        <View style={styles.rowWrap}>
          {THEMES.map((mode) => {
            const active = settings.theme === mode;
            return (
              <Pressable
                key={mode}
                onPress={() => void update({ theme: mode })}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? tokens.primary : tokens.surfaceAlt,
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
                  {themeLabel(mode)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title={t.settingsSectionTimeline} tokens={tokens}>
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>
          {t.retentionDays}
        </Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          {t.retentionDaysHint}
        </Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          {t.itemsStoredCount(itemsInActiveSpace)} · {t.limitsExplanation}
        </Text>
        <View style={styles.inlineForm}>
          <TextInput
            keyboardType="number-pad"
            value={retentionDraft}
            onChangeText={(v) => {
              setRetentionDraft(v);
              setRetentionError('');
            }}
            style={[
              styles.input,
              styles.flexInput,
              {
                color: tokens.text,
                borderColor: retentionError ? tokens.danger : tokens.border,
                backgroundColor: tokens.surfaceAlt,
              },
            ]}
          />
          <Pressable
            onPress={() => void saveRetention()}
            style={[styles.smallBtn, { backgroundColor: tokens.primary }]}
          >
            <Text style={{ color: tokens.primaryText }}>{t.save}</Text>
          </Pressable>
        </View>
        {retentionError ? (
          <Text style={{ color: tokens.danger, fontSize: 13 }}>{retentionError}</Text>
        ) : null}
        <ActionButton
          label={t.applyRetentionNow}
          onPress={() => void handleApplyRetention()}
          tokens={tokens}
        />
        <ActionButton
          label={t.removeReadItems}
          onPress={handleRemoveRead}
          tokens={tokens}
        />
        <ActionButton
          label={t.clearAllItems}
          onPress={handleClearAll}
          tokens={tokens}
        />
      </Section>

      <Section title={t.settingsSectionRefresh} tokens={tokens}>
        <SettingRow
          title={t.refreshOnOpen}
          hint={t.refreshOnOpenHint}
          tokens={tokens}
        >
          <Switch
            value={settings.refreshOnOpen}
            onValueChange={(v) => void update({ refreshOnOpen: v })}
            {...switchProps}
          />
        </SettingRow>
        <SettingRow
          title={t.notifyOnNewItems}
          hint={t.notifyOnNewItemsHint}
          tokens={tokens}
        >
          <Switch
            value={settings.notifyOnNewItems}
            onValueChange={(v) => void update({ notifyOnNewItems: v })}
            {...switchProps}
          />
        </SettingRow>
      </Section>

      <Section title={t.settingsSectionOrganization} tokens={tokens}>
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>{t.activeSpace}</Text>
        <Text style={[styles.hint, { color: tokens.textMuted, marginBottom: 12 }]}>
          {activeSpace ? spaceDisplayName(activeSpace) : '—'}
          {' · '}
          {t.switchSpaceHint}
        </Text>
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>{t.folders}</Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.foldersHint}</Text>
        <View style={styles.inlineForm}>
          <TextInput
            value={folderName}
            onChangeText={setFolderName}
            placeholder={t.folder}
            placeholderTextColor={tokens.textFaint}
            style={[
              styles.input,
              styles.flexInput,
              {
                color: tokens.text,
                borderColor: tokens.border,
                backgroundColor: tokens.surfaceAlt,
              },
            ]}
          />
          <Pressable
            onPress={() => {
              void addFolder(folderName).then(() => setFolderName(''));
            }}
            style={[styles.smallBtn, { backgroundColor: tokens.primary }]}
          >
            <Text style={{ color: tokens.primaryText }}>{t.save}</Text>
          </Pressable>
        </View>

        <Text style={[styles.fieldLabel, { color: tokens.text, marginTop: 8 }]}>
          {t.tags}
        </Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.tagsHint}</Text>
        <View style={styles.inlineForm}>
          <TextInput
            value={tagName}
            onChangeText={setTagName}
            placeholder={t.tagName}
            placeholderTextColor={tokens.textFaint}
            style={[
              styles.input,
              styles.flexInput,
              {
                color: tokens.text,
                borderColor: tokens.border,
                backgroundColor: tokens.surfaceAlt,
              },
            ]}
          />
          <Pressable
            onPress={() => {
              void addTag(tagName).then(() => setTagName(''));
            }}
            style={[styles.smallBtn, { backgroundColor: tokens.primary }]}
          >
            <Text style={{ color: tokens.primaryText }}>{t.addTag}</Text>
          </Pressable>
        </View>
        {tags.map((tag) => (
          <View key={tag.id} style={styles.tagRow}>
            {editingTagId === tag.id ? (
              <View style={styles.inlineForm}>
                <TextInput
                  value={tagEditDraft}
                  onChangeText={setTagEditDraft}
                  style={[
                    styles.input,
                    styles.flexInput,
                    {
                      color: tokens.text,
                      borderColor: tokens.border,
                      backgroundColor: tokens.surfaceAlt,
                    },
                  ]}
                />
                <Pressable
                  onPress={() => {
                    void renameTag(tag.id, tagEditDraft).then(() => {
                      setEditingTagId(null);
                      setTagEditDraft('');
                    });
                  }}
                >
                  <Text style={{ color: tokens.primary }}>{t.save}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Text style={{ color: tokens.textMuted, flex: 1 }}>• {tag.name}</Text>
                <Pressable
                  onPress={() => {
                    setEditingTagId(tag.id);
                    setTagEditDraft(tag.name);
                  }}
                  hitSlop={8}
                >
                  <Text style={{ color: tokens.primary, fontSize: 13 }}>{t.edit}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    Alert.alert(tag.name, t.deleteTagConfirm, [
                      { text: t.cancel, style: 'cancel' },
                      {
                        text: t.delete,
                        style: 'destructive',
                        onPress: () => void removeTag(tag.id),
                      },
                    ]);
                  }}
                  hitSlop={8}
                >
                  <Text style={{ color: tokens.danger, fontSize: 13 }}>{t.delete}</Text>
                </Pressable>
              </>
            )}
          </View>
        ))}
      </Section>

      <Section title={t.settingsSectionData} tokens={tokens}>
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>
          {t.backupJson}
        </Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          {t.backupJsonHint}
        </Text>
        <ActionButton
          label={t.exportBackup}
          onPress={() => void exportBackupJson()}
          tokens={tokens}
        />
        <ActionButton
          label={t.importBackup}
          onPress={() => void importBackupJson()}
          tokens={tokens}
        />

        <Text style={[styles.fieldLabel, { color: tokens.text, marginTop: 8 }]}>
          OPML
        </Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.opmlHint}</Text>
        <ActionButton
          label={t.exportOpml}
          onPress={() => void exportOpml()}
          tokens={tokens}
        />
        <Text style={[styles.hint, { color: tokens.textMuted, marginTop: 4 }]}>
          {t.mergeOpmlHint}
        </Text>
        <ActionButton
          label={`${t.importOpml} (${t.mergeOpml})`}
          onPress={() => void importOpml('merge')}
          tokens={tokens}
        />
        <Text style={[styles.hint, { color: tokens.textMuted, marginTop: 4 }]}>
          {t.replaceOpmlHint}
        </Text>
        <ActionButton
          label={`${t.importOpml} (${t.replaceOpml})`}
          onPress={() => {
            Alert.alert(t.importOpml, t.replaceOpmlHint, [
              { text: t.cancel, style: 'cancel' },
              {
                text: t.save,
                style: 'destructive',
                onPress: () => void importOpml('replace'),
              },
            ]);
          }}
          tokens={tokens}
        />
      </Section>

      <Section title={t.settingsSectionAdvanced} tokens={tokens}>
        <SettingRow
          title={t.allowHttpFeeds}
          hint={t.allowHttpFeedsHint}
          tokens={tokens}
        >
          <Switch
            value={settings.allowHttpFeeds}
            onValueChange={(v) => void update({ allowHttpFeeds: v })}
            {...switchProps}
          />
        </SettingRow>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  tokens,
}: {
  title: string;
  children: ReactNode;
  tokens: ThemeTokens;
}) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function SettingRow({
  title,
  hint,
  children,
  tokens,
}: {
  title: string;
  hint: string;
  children: ReactNode;
  tokens: ThemeTokens;
}) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingRowText}>
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>{title}</Text>
        <Text style={[styles.hint, { color: tokens.textMuted }]}>{hint}</Text>
      </View>
      {children}
    </View>
  );
}

function ActionButton({
  label,
  onPress,
  tokens,
}: {
  label: string;
  onPress: () => void;
  tokens: ThemeTokens;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionBtn,
        {
          backgroundColor: tokens.surfaceAlt,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={{ color: tokens.primary, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  fieldLabel: { fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 13, lineHeight: 18 },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingRowText: { flex: 1, gap: 4 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inlineForm: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  flexInput: { flex: 1 },
  smallBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
});
