import { Linking, Alert } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { unwrapEmbeddedHttpUrl, validateItemLink } from './urls';
import { t } from '../i18n';

export async function safeOpenLink(link: string): Promise<boolean> {
  const validated = validateItemLink(unwrapEmbeddedHttpUrl(link));
  if (!validated.ok) {
    Alert.alert(t.appName, t.unsafeLinkBlocked);
    return false;
  }

  const href = validated.url.href;
  try {
    await WebBrowser.openBrowserAsync(href, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.AUTOMATIC,
    });
    return true;
  } catch {
    const can = await Linking.canOpenURL(href);
    if (can) {
      await Linking.openURL(href);
      return true;
    }
    Alert.alert(t.appName, t.unsafeLinkBlocked);
    return false;
  }
}
