import { Linking } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { unwrapEmbeddedHttpUrl, validateItemLink } from './urls';

export type SafeOpenLinkResult =
  { ok: true } | { ok: false; reason: 'blocked' | 'open_failed' };

export async function safeOpenLink(link: string): Promise<SafeOpenLinkResult> {
  const validated = validateItemLink(unwrapEmbeddedHttpUrl(link));
  if (!validated.ok) {
    return { ok: false, reason: 'blocked' };
  }

  const href = validated.url.href;
  try {
    await WebBrowser.openBrowserAsync(href, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
    return { ok: true };
  } catch {
    const can = await Linking.canOpenURL(href);
    if (can) {
      await Linking.openURL(href);
      return { ok: true };
    }
    return { ok: false, reason: 'open_failed' };
  }
}
