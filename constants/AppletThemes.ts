import { colors } from './Theme';

export type AppletPresetThemeId =
  | 'teal'
  | 'sigma'
  | 'databricks'
  | 'snowflake'
  | 'violet'
  | 'pink'
  | 'orange'
  | 'yellow'
  | 'emerald'
  | 'slate';

export type AppletThemeId = AppletPresetThemeId | 'custom';

export const DEFAULT_APPLET_THEME_ID: AppletThemeId = 'teal';

/**
 * My Apps applet accent swatches — full hue range so users can pick any vibe.
 * Default `teal` uses brand purple; app chrome elsewhere stays neutral + accentBlue.
 */
export const APPLET_THEME_OPTIONS: { id: AppletPresetThemeId; label: string; color: string }[] = [
  { id: 'teal', label: 'Brand Purple', color: colors.accentBlue },
  { id: 'sigma', label: 'Sigma Blue', color: '#0059EC' },
  { id: 'databricks', label: 'Databricks Red', color: '#FE3A27' },
  { id: 'snowflake', label: 'Snowflake Blue', color: '#28B6E7' },
  { id: 'violet', label: 'Violet', color: '#A855F7' },
  { id: 'pink', label: 'Pink', color: '#EC4899' },
  { id: 'orange', label: 'Orange', color: '#EA580C' },
  { id: 'yellow', label: 'Yellow', color: '#EAB308' },
  { id: 'emerald', label: 'Emerald', color: '#059669' },
  { id: 'slate', label: 'Slate', color: '#64748B' },
];

const PRESET_THEME_IDS = new Set<string>(APPLET_THEME_OPTIONS.map((t) => t.id));

function mixHex(a: string, b: string, t: number): string {
  const pa = a.replace('#', '');
  const pb = b.replace('#', '');
  if (pa.length !== 6 || pb.length !== 6) return a.startsWith('#') ? a : `#${a}`;
  const c = (s: string, i: number) => parseInt(s.slice(i, i + 2), 16);
  const r = Math.round(c(pa, 0) + (c(pb, 0) - c(pa, 0)) * t);
  const g = Math.round(c(pa, 2) + (c(pb, 2) - c(pa, 2)) * t);
  const bl = Math.round(c(pa, 4) + (c(pb, 4) - c(pa, 4)) * t);
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(bl)}`;
}

const SLATE_NEUTRAL = '#94A3B8';

/**
 * Blend API-provided tile chroma toward slate so catalog cards stay subdued (accent is brand purple elsewhere).
 */
export function softenDisplayAccent(hex: string | undefined | null, fallbackHex: string): string {
  const raw = (hex && hex.trim()) || '';
  const normalized = raw.startsWith('#') ? raw : raw ? `#${raw}` : '';
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    return fallbackHex.startsWith('#') ? fallbackHex : `#${fallbackHex}`;
  }
  return mixHex(normalized, SLATE_NEUTRAL, 0.2);
}

export function isPresetAppletThemeId(v: string | undefined | null): v is AppletPresetThemeId {
  return !!v && PRESET_THEME_IDS.has(v);
}

export function isAppletThemeId(v: string | undefined | null): v is AppletThemeId {
  return !!v && (v === 'custom' || PRESET_THEME_IDS.has(v));
}

/** Normalize user input to `#RRGGBB` or null if invalid. */
export function normalizeThemeCustomHex(raw: string): string | null {
  const s = raw.trim().replace(/^#/, '');
  if (!s) return null;
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) {
    return `#${s.toUpperCase()}`;
  }
  return null;
}

export function getAppletAccentColor(themeId?: string | null, customHex?: string | null): string {
  if (themeId === 'custom') {
    const n = normalizeThemeCustomHex(customHex || '');
    if (n) return n;
    return APPLET_THEME_OPTIONS[0].color;
  }
  if (isPresetAppletThemeId(themeId)) {
    const opt = APPLET_THEME_OPTIONS.find((t) => t.id === themeId);
    if (opt) return opt.color;
  }
  return APPLET_THEME_OPTIONS[0].color;
}

/** Prefer locally persisted id (device), then API value. */
export function resolveAppletThemeId(fromLocal?: string | null, fromApi?: string | null): AppletThemeId {
  if (isAppletThemeId(fromLocal)) return fromLocal;
  if (isAppletThemeId(fromApi)) return fromApi;
  return DEFAULT_APPLET_THEME_ID;
}

/**
 * Convert UI theme selection (preset id + optional custom hex) into the single
 * `#RRGGBB` value stored in `applets.color`. Returns null when no color is set,
 * meaning "use default accent".
 */
export function resolveColorHexForSave(
  themeId?: string | null,
  customHex?: string | null,
): string | null {
  const hex = getAppletAccentColor(themeId, customHex);
  return normalizeThemeCustomHex(hex);
}

/**
 * Map a stored hex back into the UI's themeId / themeCustomHex pair. If the hex
 * exactly matches a preset swatch, treat it as that preset; otherwise custom.
 * Missing / invalid values fall back to the default preset.
 */
export function themeFromStoredColor(
  color?: string | null,
): { themeId: AppletThemeId; themeCustomHex?: string } {
  if (!color) return { themeId: DEFAULT_APPLET_THEME_ID };
  const normalized = normalizeThemeCustomHex(color);
  if (!normalized) return { themeId: DEFAULT_APPLET_THEME_ID };
  const preset = APPLET_THEME_OPTIONS.find(
    (opt) => (normalizeThemeCustomHex(opt.color) ?? opt.color.toUpperCase()) === normalized,
  );
  if (preset) return { themeId: preset.id };
  return { themeId: 'custom', themeCustomHex: normalized };
}

/** Muted tile icon background — rgba avoids unreliable #RRGGBBAA on some Android builds. */
export function appletAccentMutedBackground(hexColor: string, opacity = 0.14): string {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) return `${hexColor}25`;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}
