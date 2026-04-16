import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  APPLET_THEME_OPTIONS,
  getAppletAccentColor,
  normalizeThemeCustomHex,
  type AppletThemeId,
} from '../constants/AppletThemes';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

type MyBuysThemeSelectorProps = {
  themeId: AppletThemeId;
  customHex: string;
  onThemeIdChange: (id: AppletThemeId) => void;
  onCustomHexChange: (hex: string) => void;
};

function hexDigitsFromFull(raw: string): string {
  const tail = raw.startsWith('#') ? raw.slice(1) : raw;
  return tail.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
}

function fullHexFromDigits(digits: string): string {
  const d = digits.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
  return d.length === 0 ? '#' : `#${d}`;
}

export function MyBuysThemeSelector({
  themeId,
  customHex,
  onThemeIdChange,
  onCustomHexChange,
}: MyBuysThemeSelectorProps) {
  const customActive = themeId === 'custom';
  const accentHex =
    normalizeThemeCustomHex(getAppletAccentColor(themeId, customHex)) ??
    getAppletAccentColor(themeId, customHex);
  const accentDigits = hexDigitsFromFull(
    normalizeThemeCustomHex(accentHex) ?? accentHex,
  );
  const customDigits = hexDigitsFromFull(customHex);
  const displayDigits = customActive ? customDigits : accentDigits;

  useEffect(() => {
    if (!customActive) return;
    const n = fullHexFromDigits(hexDigitsFromFull(customHex));
    if (n !== customHex) onCustomHexChange(n);
  }, [customActive, customHex, onCustomHexChange]);

  const handleDigitsChange = (text: string) => {
    onCustomHexChange(fullHexFromDigits(text));
  };

  const handlePalettePress = () => {
    if (themeId !== 'custom') {
      onCustomHexChange(accentHex);
    }
    onThemeIdChange('custom');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Applet accent</Text>
      <View style={styles.row}>
        {APPLET_THEME_OPTIONS.map((t) => {
          const selected = t.id === themeId;
          return (
            <TouchableOpacity
              key={t.id}
              onPress={() => onThemeIdChange(t.id)}
              style={[styles.swatch, selected && styles.swatchSelected]}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${t.label} theme`}
            >
              <View style={[styles.dot, { backgroundColor: t.color }]} />
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={handlePalettePress}
          style={[styles.swatch, themeId === 'custom' && styles.swatchSelected]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ selected: themeId === 'custom' }}
          accessibilityLabel="Custom hex color. Opens the hex field when selected."
        >
          <Ionicons name="color-palette-outline" size={22} color={colors.textSecondary} />
        </TouchableOpacity>
        <View style={[styles.hexField, !customActive && styles.hexFieldMuted]}>
          <Text style={styles.hexHash} importantForAccessibility="no">
            #
          </Text>
          <TextInput
            style={styles.hexInputInner}
            value={displayDigits}
            onChangeText={handleDigitsChange}
            placeholder="2D3748"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            editable={customActive}
            showSoftInputOnFocus={customActive}
            includeFontPadding={false}
            accessibilityLabel="Hex color digits, six characters after the number sign"
          />
        </View>
      </View>
    </View>
  );
}

const DOT_SIZE = 32;
const SWATCH_SIZE = 42;

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'transparent',
    backgroundColor: colors.background,
  },
  swatchSelected: {
    borderColor: colors.textPrimary,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: borderRadius.sm,
  },
  hexField: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm,
    backgroundColor: colors.background,
  },
  hexFieldMuted: {
    backgroundColor: colors.surface,
  },
  hexHash: {
    ...typography.body,
    color: colors.textPrimary,
    marginRight: 2,
  },
  hexInputInner: {
    flex: 1,
    minWidth: 48,
    height: 44,
    padding: 0,
    margin: 0,
    ...typography.body,
    lineHeight: 20,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
    textAlignVertical: 'center',
  },
});
