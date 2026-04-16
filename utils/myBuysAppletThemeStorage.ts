import type { Applet } from '../types/mybuys.types';
import { normalizeThemeCustomHex, resolveAppletThemeId } from '../constants/AppletThemes';

type Stored = { themeId: string; customHex?: string };

/** In-memory map — survives the JS session but not an app restart. */
const themeMap: Record<string, Stored> = {};

const FALLBACK_CUSTOM = '#3B6FA0';

export async function persistAppletTheme(appletId: string, themeId: string, themeCustomHex?: string): Promise<void> {
  if (themeId === 'custom') {
    const hex = normalizeThemeCustomHex(themeCustomHex || '') || FALLBACK_CUSTOM;
    themeMap[appletId] = { themeId: 'custom', customHex: hex };
  } else {
    themeMap[appletId] = { themeId };
  }
}

export async function removeAppletThemeId(appletId: string): Promise<void> {
  delete themeMap[appletId];
}

function mergeOne(a: Applet): Applet {
  const stored = themeMap[a.appletId];
  const mergedId = resolveAppletThemeId(stored?.themeId ?? null, a.themeId ?? null);
  let themeCustomHex: string | undefined;

  if (stored?.themeId === 'custom' && stored.customHex) {
    themeCustomHex = normalizeThemeCustomHex(stored.customHex) ?? stored.customHex;
  } else if (mergedId === 'custom' && a.themeCustomHex) {
    themeCustomHex = normalizeThemeCustomHex(a.themeCustomHex) ?? a.themeCustomHex;
  }

  const { themeCustomHex: _dropped, ...rest } = a;
  if (mergedId === 'custom' && themeCustomHex) {
    return { ...rest, themeId: mergedId, themeCustomHex };
  }
  return { ...rest, themeId: mergedId };
}

/** Merge API applet list with locally cached theme (local wins over API). */
export async function mergeAppletsWithStoredThemes(applets: Applet[]): Promise<Applet[]> {
  return applets.map(mergeOne);
}
