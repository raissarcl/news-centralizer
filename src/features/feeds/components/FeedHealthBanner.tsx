import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeTokens } from '@/theme';
import { t } from '@/lib/i18n';

type Props = {
  tokens: ThemeTokens;
  errors: number;
  paused: number;
  onResumeAll: () => void;
};

export function FeedHealthBanner({
  tokens,
  errors,
  paused,
  onResumeAll,
}: Props) {
  if (errors === 0 && paused === 0) return null;

  return (
    <View
      style={[
        styles.healthBanner,
        { backgroundColor: tokens.surfaceAlt, borderColor: tokens.border },
      ]}
    >
      <Text style={{ color: tokens.textMuted, fontSize: 13, flex: 1 }}>
        {t.feedHealthSummary(errors, paused)}
      </Text>
      {paused > 0 ? (
        <Pressable
          onPress={onResumeAll}
          style={[styles.resumeBtn, { borderColor: tokens.primary }]}
        >
          <Text
            style={{ color: tokens.primary, fontSize: 13, fontWeight: '500' }}
          >
            {t.resumePausedFeeds}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
