/** Build-time flag: ship only the general-news space (no Computing). */
export function isGeneralOnly(): boolean {
  const v = process.env.EXPO_PUBLIC_GENERAL_ONLY;
  return v === '1' || v === 'true';
}
