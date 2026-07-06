import { useColorScheme } from 'react-native';
import { useSettingsStore } from './store/settings';

export type ThemeTokens = {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  primaryText: string;
  danger: string;
  success: string;
  unreadDot: string;
  switchTrackOn: string;
  switchTrackOff: string;
  switchThumb: string;
};

const lightTokens: ThemeTokens = {
  bg: '#ffffff',
  surface: '#ffffff',
  surfaceAlt: '#f8fafc',
  border: '#e2e8f0',
  text: '#0f172a',
  textMuted: '#475569',
  textFaint: '#94a3b8',
  primary: '#1d4ed8',
  primaryText: '#ffffff',
  danger: '#dc2626',
  success: '#059669',
  unreadDot: '#1d4ed8',
  switchTrackOn: '#93b4f5',
  switchTrackOff: '#cbd5e1',
  switchThumb: '#ffffff',
};

const darkTokens: ThemeTokens = {
  bg: '#0b0b0f',
  surface: '#141419',
  surfaceAlt: '#1a1a22',
  border: '#2e3340',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  textFaint: '#64748b',
  primary: '#93b8ff',
  primaryText: '#0a0f18',
  danger: '#f87171',
  success: '#34d399',
  unreadDot: '#93b8ff',
  switchTrackOn: '#3b5998',
  switchTrackOff: '#3f4654',
  switchThumb: '#f1f5f9',
};

export function getSwitchProps(tokens: ThemeTokens) {
  return {
    trackColor: { false: tokens.switchTrackOff, true: tokens.switchTrackOn },
    thumbColor: tokens.switchThumb,
    ios_backgroundColor: tokens.switchTrackOff,
  };
}

export function useTheme(): { tokens: ThemeTokens; isDark: boolean } {
  const system = useColorScheme();
  const themeMode = useSettingsStore((s) => s.settings.theme);
  const resolved =
    themeMode === 'system' ? (system === 'dark' ? 'dark' : 'light') : themeMode;
  return {
    tokens: resolved === 'dark' ? darkTokens : lightTokens,
    isDark: resolved === 'dark',
  };
}
