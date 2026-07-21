import { memo, useCallback, useMemo } from 'react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  Image,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { safeOpenLink } from '@/lib/security/safeOpenLink';
import { feedHostLabel } from '@/lib/feeds/feedHostLabel';
import { resolveFeedFavicon } from '@/lib/favicon';
import { cleanFeedText } from '@/lib/text/cleanFeedText';
import type { FeedItem, FeedSource } from '@/types';
import { useTheme } from '@/theme';
import { t } from '@/lib/i18n';

const ACTION_WIDTH = 80;
const SWIPE_ACTIVATION = 48;
const SWIPE_COMMIT = 72;

type Props = {
  item: FeedItem;
  feed?: FeedSource;
  onOpen: (itemId: string, link: string) => void;
  onToggleStar: (itemId: string) => void;
  onToggleRead: (itemId: string, read: boolean) => void;
};

export const FeedItemRow = memo(function FeedItemRow({
  item,
  feed,
  onOpen,
  onToggleStar,
  onToggleRead,
}: Props) {
  const { tokens } = useTheme();
  const translateX = useSharedValue(0);
  const favicon = feed ? resolveFeedFavicon(feed) : undefined;
  const displayTitle = useMemo(() => cleanFeedText(item.title), [item.title]);
  const displaySummary = useMemo(
    () => (item.summary ? cleanFeedText(item.summary) : undefined),
    [item.summary],
  );

  let absoluteDate = '';
  let timeLabel = '';
  try {
    const parsed = parseISO(item.publishedAt);
    absoluteDate = format(parsed, 'd MMM yyyy', { locale: ptBR });
    timeLabel = formatDistanceToNow(parsed, {
      addSuffix: true,
      locale: ptBR,
    });
  } catch {
    absoluteDate = '';
    timeLabel = '';
  }

  const sourceLabel = feed
    ? feed.siteUrl
      ? `${feed.title} · ${feedHostLabel(feed.siteUrl)}`
      : `${feed.title} · ${feedHostLabel(feed.url)}`
    : '';

  const shareItem = async () => {
    await Share.share({ message: `${displayTitle}\n${item.link}` });
  };

  const markReadIfNeeded = useCallback(() => {
    if (!item.read) onToggleRead(item.id, true);
  }, [item.id, item.read, onToggleRead]);

  const openLink = useCallback(() => {
    markReadIfNeeded();
    onOpen(item.id, item.link);
  }, [item.id, item.link, markReadIfNeeded, onOpen]);

  const showActions = useCallback(() => {
    Alert.alert(displayTitle, undefined, [
      { text: t.cancel, style: 'cancel' },
      {
        text: item.read ? t.markUnread : t.markRead,
        onPress: () => onToggleRead(item.id, !item.read),
      },
      {
        text: item.starred ? t.unstar : t.star,
        onPress: () => onToggleStar(item.id),
      },
      { text: t.share, onPress: () => void shareItem() },
      { text: t.openLink, onPress: openLink },
    ]);
  }, [displayTitle, item, onToggleRead, onToggleStar, openLink]);

  const toggleRead = useCallback(() => {
    onToggleRead(item.id, !item.read);
  }, [item.id, item.read, onToggleRead]);

  const rowGesture = useMemo(() => {
    const pan = Gesture.Pan()
      .activeOffsetX(SWIPE_ACTIVATION)
      .failOffsetY([-12, 12])
      .onUpdate((event) => {
        if (event.translationX > 0) {
          translateX.value = Math.min(event.translationX, ACTION_WIDTH);
        } else {
          translateX.value = 0;
        }
      })
      .onEnd(() => {
        if (translateX.value >= SWIPE_COMMIT) {
          runOnJS(toggleRead)();
        }
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      });

    const tap = Gesture.Tap().onEnd(() => {
      runOnJS(openLink)();
    });

    const longPress = Gesture.LongPress()
      .minDuration(400)
      .onStart(() => {
        runOnJS(showActions)();
      });

    return Gesture.Simultaneous(pan, Gesture.Exclusive(longPress, tap));
  }, [openLink, showActions, toggleRead, translateX]);

  const rowAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const actionAnimatedStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? 1 : 0,
  }));

  return (
    <View style={styles.swipeContainer}>
      <Animated.View
        style={[
          styles.swipeAction,
          { backgroundColor: tokens.primary },
          actionAnimatedStyle,
        ]}
      >
        <Ionicons
          name={item.read ? 'mail-unread-outline' : 'checkmark-circle-outline'}
          size={22}
          color={tokens.primaryText}
        />
        <Text style={{ color: tokens.primaryText, fontSize: 12 }}>
          {item.read ? t.markUnread : t.markRead}
        </Text>
      </Animated.View>
      <GestureDetector gesture={rowGesture}>
        <Animated.View
          accessibilityRole="button"
          accessibilityLabel={`${displayTitle}. ${item.read ? t.read : t.unread}`}
          style={[
            styles.row,
            rowAnimatedStyle,
            {
              backgroundColor: tokens.surface,
              borderColor: tokens.border,
            },
          ]}
        >
          {favicon ? (
            <Image source={{ uri: favicon }} style={styles.favicon} />
          ) : (
            <View
              style={[
                styles.faviconPlaceholder,
                { backgroundColor: tokens.surfaceAlt },
              ]}
            />
          )}
          <View style={styles.main}>
            {sourceLabel ? (
              <Text
                style={[styles.kicker, { color: tokens.textMuted }]}
                numberOfLines={1}
              >
                {sourceLabel}
              </Text>
            ) : null}
            <View style={styles.titleRow}>
              {!item.read && (
                <View
                  style={[
                    styles.unreadDot,
                    { backgroundColor: tokens.unreadDot },
                  ]}
                />
              )}
              <Text
                style={[
                  styles.title,
                  {
                    color: tokens.text,
                    fontWeight: item.read ? '400' : '600',
                  },
                ]}
                numberOfLines={3}
              >
                {displayTitle}
              </Text>
            </View>
            {displaySummary ? (
              <Text
                style={[styles.summary, { color: tokens.textMuted }]}
                numberOfLines={2}
              >
                {displaySummary}
              </Text>
            ) : null}
            <View style={styles.metaRow}>
              {absoluteDate ? (
                <Text style={[styles.meta, { color: tokens.textFaint }]}>
                  {absoluteDate}
                  {timeLabel ? ` · ${timeLabel}` : ''}
                </Text>
              ) : null}
            </View>
          </View>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.thumbnail} />
          ) : null}
          <Pressable
            onPress={() => onToggleStar(item.id)}
            hitSlop={12}
            style={styles.starBtn}
            accessibilityRole="button"
            accessibilityLabel={item.starred ? t.unstar : t.star}
          >
            <Ionicons
              name={item.starred ? 'star' : 'star-outline'}
              size={20}
              color={item.starred ? tokens.primary : tokens.textFaint}
            />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

export async function openItemLink(link: string): Promise<void> {
  const result = await safeOpenLink(link);
  if (!result.ok) {
    Alert.alert(t.appName, t.unsafeLinkBlocked);
  }
}

const styles = StyleSheet.create({
  swipeContainer: {
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  favicon: { width: 20, height: 20, borderRadius: 4, marginTop: 2 },
  faviconPlaceholder: { width: 20, height: 20, borderRadius: 4, marginTop: 2 },
  main: { flex: 1, gap: 4 },
  kicker: { fontSize: 13, fontWeight: '500' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  title: { flex: 1, fontSize: 16, lineHeight: 22 },
  summary: { fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { fontSize: 12 },
  thumbnail: { width: 48, height: 48, borderRadius: 8, marginTop: 2 },
  starBtn: { paddingTop: 2 },
  swipeAction: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ACTION_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
  },
});
