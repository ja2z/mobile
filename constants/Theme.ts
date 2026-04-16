/**
 * Design System Theme
 * Light theme with black as the dominant color and steel-blue / copper / magenta accents.
 */

export const colors = {
  // Primary Palette
  primary: '#000000',
  primaryDark: '#333333',
  primaryLight: '#F0F0F0',

  // Brand accents (derived from papercrane icon)
  accentBlue: '#3B6FA0',
  accentBlueLight: '#EBF0F7',
  accentCopper: '#B87840',
  accentCopperLight: '#FBF3EA',
  accentMagenta: '#A03068',
  accentMagentaLight: '#F5E8EF',

  // Neutrals
  background: '#FFFFFF',
  surface: '#F8F9FA',
  border: '#E5E7EB',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',

  // Semantic Colors
  success: '#10B981',
  error: '#EF4444',
  warning: '#DC2626',
  info: '#3B82F6',

  // Tile Colors
  tileColors: {
    orange1: '#000000',
    orange2: '#000000',
    orange3: '#000000',
    orange4: '#000000',
  },

  /** Pencil icon on tiles — near-black for contrast on light card backgrounds. */
  editPencilColor: '#1A1A1A',

  /**
   * Stack nav headers for folder sections — near-black.
   */
  folderSections: {
    myBuys: '#1A1A1A',
    sigmanauts: '#1A1A1A',
    ai: '#1A1A1A',
    dashboards: '#1A1A1A',
    apps: '#1A1A1A',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
};

export const typography = {
  h1: {
    fontSize: 32,
    fontWeight: '700' as const,
    lineHeight: 40,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 32,
  },
  h3: {
    fontSize: 20,
    fontWeight: '600' as const,
    lineHeight: 28,
  },
  body: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodySmall: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    lineHeight: 16,
  },
};

export const shadows = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
};

