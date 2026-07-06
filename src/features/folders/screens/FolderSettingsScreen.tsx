import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFeedsStore } from '@/store/feeds';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';

const MIN_RETENTION = 1;
const MAX_RETENTION = 365;

export function FolderSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { tokens } = useTheme();
  const folders = useFeedsStore((s) => s.folders);
  const renameFolder = useFeedsStore((s) => s.renameFolder);
  const removeFolder = useFeedsStore((s) => s.removeFolder);
  const updateFolderRetention = useFeedsStore((s) => s.updateFolderRetention);

  const folder = folders.find((f) => f.id === id);
  const [nameDraft, setNameDraft] = useState('');
  const [retentionDraft, setRetentionDraft] = useState('');
  const [retentionError, setRetentionError] = useState('');

  useEffect(() => {
    if (folder) {
      setNameDraft(folder.name);
      setRetentionDraft(folder.retentionDays != null ? String(folder.retentionDays) : '');
      setRetentionError('');
    }
  }, [folder]);

  if (!folder) {
    return (
      <View style={[styles.empty, { backgroundColor: tokens.bg }]}>
        <Text style={{ color: tokens.textMuted }}>{t.noFolders}</Text>
      </View>
    );
  }

  const isInbox = folder.id === 'inbox';

  const saveRename = async () => {
    const trimmed = nameDraft.trim();
    if (!trimmed || isInbox) return;
    await renameFolder(folder.id, trimmed);
    router.back();
  };

  const saveRetention = async () => {
    const trimmed = retentionDraft.trim();
    if (!trimmed) {
      await updateFolderRetention(folder.id, null);
      router.back();
      return;
    }
    const n = parseInt(trimmed, 10);
    if (Number.isNaN(n) || n < MIN_RETENTION || n > MAX_RETENTION) {
      setRetentionError(t.retentionInvalid);
      return;
    }
    setRetentionError('');
    await updateFolderRetention(folder.id, n);
    router.back();
  };

  const confirmDelete = () => {
    Alert.alert(t.deleteFolder, t.deleteFolderConfirm, [
      { text: t.cancel, style: 'cancel' },
      {
        text: t.delete,
        style: 'destructive',
        onPress: () => {
          void removeFolder(folder.id).then(() => router.back());
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {!isInbox ? (
        <>
          <Text style={[styles.label, { color: tokens.textMuted }]}>{t.renameFolder}</Text>
          <TextInput
            value={nameDraft}
            onChangeText={setNameDraft}
            style={[
              styles.input,
              {
                color: tokens.text,
                borderColor: tokens.border,
                backgroundColor: tokens.surfaceAlt,
              },
            ]}
          />
          <Pressable
            onPress={() => void saveRename()}
            style={[styles.primaryBtn, { backgroundColor: tokens.primary }]}
          >
            <Text style={{ color: tokens.primaryText, fontWeight: '600' }}>{t.save}</Text>
          </Pressable>
        </>
      ) : (
        <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.inboxCannotRename}</Text>
      )}

      <Text style={[styles.label, { color: tokens.textMuted }]}>{t.folderRetentionLabel}</Text>
      <Text style={[styles.hint, { color: tokens.textMuted }]}>{t.folderRetentionHint}</Text>
      <TextInput
        keyboardType="number-pad"
        value={retentionDraft}
        onChangeText={(v) => {
          setRetentionDraft(v);
          setRetentionError('');
        }}
        placeholder={t.folderRetentionPlaceholder}
        placeholderTextColor={tokens.textFaint}
        style={[
          styles.input,
          {
            color: tokens.text,
            borderColor: retentionError ? tokens.danger : tokens.border,
            backgroundColor: tokens.surfaceAlt,
          },
        ]}
      />
      {retentionError ? (
        <Text style={{ color: tokens.danger, fontSize: 13 }}>{retentionError}</Text>
      ) : null}
      <Pressable
        onPress={() => void saveRetention()}
        style={[styles.primaryBtn, { backgroundColor: tokens.primary }]}
      >
        <Text style={{ color: tokens.primaryText, fontWeight: '600' }}>
          {t.saveFolderRetention}
        </Text>
      </Pressable>

      {!isInbox ? (
        <Pressable
          onPress={confirmDelete}
          style={[styles.dangerBtn, { borderColor: tokens.danger }]}
        >
          <Text style={{ color: tokens.danger, fontWeight: '500' }}>{t.deleteFolder}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '500' },
  hint: { fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  primaryBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  dangerBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
  },
});
