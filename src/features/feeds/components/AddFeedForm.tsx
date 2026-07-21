import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Folder } from '@/types';
import type { ThemeTokens } from '@/theme';
import { t } from '@/lib/i18n';
import { isRssHubUrl, suggestRssHubUrl } from '@/lib/rsshub';
import { validateFeedUrl } from '@/lib/security/urls';

type Props = {
  tokens: ThemeTokens;
  url: string;
  title: string;
  folders: Folder[];
  selectedFolderId: string;
  onUrlChange: (url: string) => void;
  onTitleChange: (title: string) => void;
  onFolderChange: (folderId: string) => void;
  onCancel: () => void;
  onSave: () => void;
};

export function AddFeedForm({
  tokens,
  url,
  title,
  folders,
  selectedFolderId,
  onUrlChange,
  onTitleChange,
  onFolderChange,
  onCancel,
  onSave,
}: Props) {
  const applyRssHubSuggestion = () => {
    const suggestion = suggestRssHubUrl(url.trim());
    if (!suggestion) return;
    const validated = validateFeedUrl(suggestion);
    if (validated.ok) onUrlChange(validated.url.href);
  };

  return (
    <View
      style={[
        styles.form,
        { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
      ]}
    >
      <TextInput
        value={url}
        onChangeText={onUrlChange}
        placeholder={t.feedUrl}
        placeholderTextColor={tokens.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          {
            color: tokens.text,
            borderColor: tokens.border,
            backgroundColor: tokens.surface,
          },
        ]}
      />
      {!isRssHubUrl(url) && suggestRssHubUrl(url) ? (
        <Pressable onPress={applyRssHubSuggestion}>
          <Text style={{ color: tokens.primary, fontSize: 13 }}>
            {t.useRssHub}
          </Text>
        </Pressable>
      ) : null}
      <Text style={{ color: tokens.textFaint, fontSize: 12 }}>
        {t.rssHubHint}
      </Text>
      <TextInput
        value={title}
        onChangeText={onTitleChange}
        placeholder={t.feedTitle}
        placeholderTextColor={tokens.textFaint}
        style={[
          styles.input,
          {
            color: tokens.text,
            borderColor: tokens.border,
            backgroundColor: tokens.surface,
          },
        ]}
      />
      <Text style={{ color: tokens.textMuted, fontSize: 13 }}>{t.folder}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.folderRow}>
          {folders.map((folder) => {
            const active = selectedFolderId === folder.id;
            return (
              <Pressable
                key={folder.id}
                onPress={() => onFolderChange(folder.id)}
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
        <Pressable onPress={onCancel}>
          <Text style={{ color: tokens.textMuted }}>{t.cancel}</Text>
        </Pressable>
        <Pressable onPress={onSave}>
          <Text style={{ color: tokens.primary, fontWeight: '600' }}>
            {t.save}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
