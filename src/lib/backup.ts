import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import { Alert } from 'react-native';
import type { PersistedBlob } from '../types';
import { CURRENT_SCHEMA_VERSION } from '../types';
import { migrateBlob } from '../store/migrate';
import { useSettingsStore } from '../store/settings';
import { useFeedsStore } from '../store/feeds';
import { feedInFolder } from './feeds/feedFolders';
import { flattenOpmlFeeds, parseOpml, serializeOpml } from './opml';
import { ENGBLOGS_STARTER_OPML } from '../data/engblogsStarter';
import {
  assertImportFileSize,
  capFeedInputs,
} from './security/importLimits';
import { t } from './i18n';
import { resolveActiveSpaceId } from './spaces';

function importResultMessage(added: number, skipped: number, base: string): string {
  if (skipped > 0) {
    return `${base} (+${added}, ${t.opmlImportSkipped(skipped)})`;
  }
  return added > 0 ? `${base} (+${added})` : base;
}

export async function buildExportBlob(): Promise<PersistedBlob> {
  const feedsState = useFeedsStore.getState();
  const settings = useSettingsStore.getState().settings;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    spaces: feedsState.spaces,
    feeds: feedsState.feeds,
    items: feedsState.items,
    folders: feedsState.folders,
    tags: feedsState.tags,
    settings,
  };
}

async function writeAndShare(
  filename: string,
  contents: string,
  mimeType: string
): Promise<boolean> {
  const uri = `${FileSystem.documentDirectory ?? ''}${filename}`;
  await FileSystem.writeAsStringAsync(uri, contents, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(uri, {
      mimeType,
      dialogTitle: filename,
    });
  }
  return available;
}

export async function exportBackupJson(): Promise<void> {
  const blob = await buildExportBlob();
  const filename = `news-centralizer-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
  await writeAndShare(filename, JSON.stringify(blob, null, 2), 'application/json');
  await useSettingsStore.getState().update({
    lastExportAt: new Date().toISOString(),
  });
}

export async function importBackupJson(): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return false;

  try {
    const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
    assertImportFileSize(raw.length);
    const parsed = JSON.parse(raw);
    const blob = migrateBlob(parsed);
    await useFeedsStore.getState().replaceAll({
      spaces: blob.spaces,
      feeds: blob.feeds,
      items: blob.items,
      folders: blob.folders,
      tags: blob.tags,
    });
    await useSettingsStore.getState().update(blob.settings);
    Alert.alert(t.appName, t.backupImported);
    return true;
  } catch {
    Alert.alert(t.appName, t.importFailed);
    return false;
  }
}

export async function exportOpml(): Promise<void> {
  const { feeds, folders } = useFeedsStore.getState();
  const activeSpaceId = resolveActiveSpaceId(
    useSettingsStore.getState().settings.activeSpaceId,
    useFeedsStore.getState().spaces
  );
  const spaceFolders = folders.filter((f) => f.spaceId === activeSpaceId);
  const spaceFeeds = feeds.filter((f) => f.spaceId === activeSpaceId);
  const folderGroups = spaceFolders.map((folder) => ({
    name: folder.name,
    feeds: spaceFeeds
      .filter((f) => feedInFolder(f, folder.id))
      .map((f) => ({
        title: f.title,
        url: f.url,
        siteUrl: f.siteUrl,
      })),
  }));

  const orphanFeeds = spaceFeeds.filter(
    (f) => !spaceFolders.some((folder) => feedInFolder(f, folder.id))
  );
  if (orphanFeeds.length > 0) {
    folderGroups.push({
      name: 'Inbox',
      feeds: orphanFeeds.map((f) => ({
        title: f.title,
        url: f.url,
        siteUrl: f.siteUrl,
      })),
    });
  }

  const xml = serializeOpml(t.appName, folderGroups);
  const filename = `news-centralizer-${format(new Date(), 'yyyy-MM-dd')}.opml`;
  await writeAndShare(filename, xml, 'application/xml');
}

export async function importOpml(mode: 'merge' | 'replace'): Promise<boolean> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/xml', 'text/xml', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return false;

  try {
    const raw = await FileSystem.readAsStringAsync(result.assets[0].uri);
    assertImportFileSize(raw.length);
    const outlines = parseOpml(raw);
    const feedInputs = capFeedInputs(flattenOpmlFeeds(outlines), mode);
    if (feedInputs.length === 0) {
      Alert.alert(t.appName, t.importFailed);
      return false;
    }

    const { added, skipped } = await useFeedsStore
      .getState()
      .importOpmlFeeds(feedInputs, mode);

    if (added === 0 && skipped > 0) {
      Alert.alert(t.appName, t.importFailed);
      return false;
    }

    Alert.alert(t.appName, importResultMessage(added, skipped, t.opmlImported));
    return true;
  } catch {
    Alert.alert(t.appName, t.importFailed);
    return false;
  }
}

export async function importEngBlogsStarter(): Promise<boolean> {
  try {
    const outlines = parseOpml(ENGBLOGS_STARTER_OPML);
    const feedInputs = flattenOpmlFeeds(outlines);
    const { added, skipped } = await useFeedsStore
      .getState()
      .importOpmlFeeds(feedInputs, 'merge');
    Alert.alert(
      t.appName,
      importResultMessage(added, skipped, t.opmlImported)
    );
    return true;
  } catch {
    Alert.alert(t.appName, t.importFailed);
    return false;
  }
}
