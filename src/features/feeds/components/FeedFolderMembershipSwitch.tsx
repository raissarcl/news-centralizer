import { Alert, Switch, Text, View } from 'react-native';
import { useFeedsStore } from '@/store/feeds';
import { feedInFolder } from '@/lib/feeds/feedFolders';
import { t } from '@/lib/i18n';
import { getSwitchProps, useTheme } from '@/theme';

type Props = {
  feedId: string;
  folderId: string;
  folderName?: string;
  switchProps: ReturnType<typeof getSwitchProps>;
  compact?: boolean;
};

export function FeedFolderMembershipSwitch({
  feedId,
  folderId,
  folderName,
  switchProps,
  compact = false,
}: Props) {
  const { tokens } = useTheme();
  const feeds = useFeedsStore((s) => s.feeds);
  const toggleFeedFolder = useFeedsStore((s) => s.toggleFeedFolder);
  const feed = feeds.find((f) => f.id === feedId);
  const inFolder = feed ? feedInFolder(feed, folderId) : false;
  const label = folderName
    ? `${t.inThisFolder}: ${folderName}`
    : t.inThisFolder;

  const onToggle = () => {
    void toggleFeedFolder(feedId, folderId).then((ok) => {
      if (!ok && inFolder) {
        Alert.alert(t.appName, t.feedMustStayInFolder);
      }
    });
  };

  if (compact) {
    return (
      <Switch
        value={inFolder}
        onValueChange={onToggle}
        accessibilityLabel={label}
        {...switchProps}
      />
    );
  }

  return (
    <View style={{ alignItems: 'center', gap: 2, minWidth: 56 }}>
      <Switch
        value={inFolder}
        onValueChange={onToggle}
        accessibilityLabel={label}
        {...switchProps}
      />
      <Text
        style={{ fontSize: 10, textAlign: 'center', color: tokens.textMuted }}
        numberOfLines={2}
      >
        {t.inThisFolder}
      </Text>
    </View>
  );
}
