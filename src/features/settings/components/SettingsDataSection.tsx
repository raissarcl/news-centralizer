import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '@/theme';
import { t } from '@/lib/i18n';
import {
  exportBackupJson,
  exportOpml,
  importBackupJson,
  importOpml,
  type BackupResult,
} from '@/lib/backup';

function showBackupResult(result: BackupResult) {
  if (!result.ok && result.canceled) return;
  Alert.alert(t.appName, result.message);
}

type Props = {
  tokens: ThemeTokens;
};

export function SettingsDataSection({ tokens }: Props) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>
        {t.settingsSectionData}
      </Text>
      <Text style={[styles.fieldLabel, { color: tokens.text }]}>
        {t.backupJson}
      </Text>
      <Text style={[styles.hint, { color: tokens.textMuted }]}>
        {t.backupJsonHint}
      </Text>
      <ActionButton
        label={t.exportBackup}
        onPress={() => void exportBackupJson().then(showBackupResult)}
        tokens={tokens}
      />
      <ActionButton
        label={t.importBackup}
        onPress={() => void importBackupJson().then(showBackupResult)}
        tokens={tokens}
      />

      <Text style={[styles.fieldLabel, { color: tokens.text, marginTop: 8 }]}>
        OPML
      </Text>
      <Text style={[styles.hint, { color: tokens.textMuted }]}>
        {t.opmlHint}
      </Text>
      <ActionButton
        label={t.exportOpml}
        onPress={() => void exportOpml().then(showBackupResult)}
        tokens={tokens}
      />
      <Text style={[styles.hint, { color: tokens.textMuted, marginTop: 4 }]}>
        {t.mergeOpmlHint}
      </Text>
      <ActionButton
        label={`${t.importOpml} (${t.mergeOpml})`}
        onPress={() => void importOpml('merge').then(showBackupResult)}
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
              onPress: () => void importOpml('replace').then(showBackupResult),
            },
          ]);
        }}
        tokens={tokens}
      />
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
  section: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  fieldLabel: { fontSize: 15, fontWeight: '500' },
  hint: { fontSize: 13, lineHeight: 18 },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
});
