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
import { useFeedsStore } from '@/store/feeds';
import { getSwitchProps, useTheme, type ThemeTokens } from '@/theme';
import { t } from '@/lib/i18n';
import { resolveActiveSpaceId } from '@/lib/spaces';
import type { ThemeMode } from '@/types';
import { SettingsDataSection } from '@/features/settings/components/SettingsDataSection';
import { SettingsOrganizationSection } from '@/features/settings/components/SettingsOrganizationSection';

const THEMES: ThemeMode[] = ['system', 'light', 'dark'];
const MIN_RETENTION = 1;
const MAX_RETENTION = 365;

export default function SettingsScreen() {
  const { tokens } = useTheme();
  const switchProps = getSwitchProps(tokens);
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const items = useFeedsStore((s) => s.items);
  const feeds = useFeedsStore((s) => s.feeds);
  const spaces = useFeedsStore((s) => s.spaces);
  const purgeItemsByRetention = useFeedsStore((s) => s.purgeItemsByRetention);
  const removeReadItems = useFeedsStore((s) => s.removeReadItems);
  const clearAllItems = useFeedsStore((s) => s.clearAllItems);

  const activeSpaceId = resolveActiveSpaceId(settings.activeSpaceId, spaces);
  const itemsInActiveSpace = useMemo(() => {
    const feedIds = new Set(
      feeds.filter((f) => f.spaceId === activeSpaceId).map((f) => f.id),
    );
    return items.filter((i) => feedIds.has(i.feedId)).length;
  }, [items, feeds, activeSpaceId]);

  const [retentionDraft, setRetentionDraft] = useState(
    String(settings.retentionDays),
  );
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
        <Text style={[styles.fieldLabel, { color: tokens.text }]}>
          {t.theme}
        </Text>
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
          <Text style={{ color: tokens.danger, fontSize: 13 }}>
            {retentionError}
          </Text>
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

      <SettingsOrganizationSection tokens={tokens} />
      <SettingsDataSection tokens={tokens} />

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
});
