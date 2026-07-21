import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { tagsInSpace, useFeedsStore } from '@/store/feeds';
import { useSettingsStore } from '@/store/settings';
import type { ThemeTokens } from '@/theme';
import { spaceDisplayName, t } from '@/lib/i18n';
import { resolveActiveSpaceId } from '@/lib/spaces';

type Props = {
  tokens: ThemeTokens;
};

export function SettingsOrganizationSection({ tokens }: Props) {
  const settings = useSettingsStore((s) => s.settings);
  const spaces = useFeedsStore((s) => s.spaces);
  const addFolder = useFeedsStore((s) => s.addFolder);
  const addTag = useFeedsStore((s) => s.addTag);
  const renameTag = useFeedsStore((s) => s.renameTag);
  const removeTag = useFeedsStore((s) => s.removeTag);
  const allTags = useFeedsStore((s) => s.tags);

  const activeSpaceId = resolveActiveSpaceId(settings.activeSpaceId, spaces);
  const activeSpace = spaces.find((s) => s.id === activeSpaceId);
  const tags = useMemo(
    () => tagsInSpace(allTags, activeSpaceId),
    [allTags, activeSpaceId],
  );

  const [folderName, setFolderName] = useState('');
  const [tagName, setTagName] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagEditDraft, setTagEditDraft] = useState('');

  return (
    <View
      style={[
        styles.section,
        { backgroundColor: tokens.surface, borderColor: tokens.border },
      ]}
    >
      <Text style={[styles.sectionTitle, { color: tokens.text }]}>
        {t.settingsSectionOrganization}
      </Text>
      <Text style={[styles.fieldLabel, { color: tokens.text }]}>
        {t.activeSpace}
      </Text>
      <Text
        style={[styles.hint, { color: tokens.textMuted, marginBottom: 12 }]}
      >
        {activeSpace ? spaceDisplayName(activeSpace) : '—'}
        {' · '}
        {t.switchSpaceHint}
      </Text>
      <Text style={[styles.fieldLabel, { color: tokens.text }]}>
        {t.folders}
      </Text>
      <Text style={[styles.hint, { color: tokens.textMuted }]}>
        {t.foldersHint}
      </Text>
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
      <Text style={[styles.hint, { color: tokens.textMuted }]}>
        {t.tagsHint}
      </Text>
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
              <Text style={{ color: tokens.textMuted, flex: 1 }}>
                • {tag.name}
              </Text>
              <Pressable
                onPress={() => {
                  setEditingTagId(tag.id);
                  setTagEditDraft(tag.name);
                }}
                hitSlop={8}
              >
                <Text style={{ color: tokens.primary, fontSize: 13 }}>
                  {t.edit}
                </Text>
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
                <Text style={{ color: tokens.danger, fontSize: 13 }}>
                  {t.delete}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ))}
    </View>
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
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
});
