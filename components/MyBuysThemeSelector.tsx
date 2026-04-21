import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
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
    if (!customActive) {
      onThemeIdChange('custom');
    }
  };

  const handleHexFocus = () => {
    if (customActive) return;
    onCustomHexChange(accentHex);
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
        <View
          style={[styles.hexField, customActive && styles.hexFieldSelected]}
        >
          <Text style={styles.hexHash} importantForAccessibility="no">
            #
          </Text>
          <TextInput
            style={styles.hexInputInner}
            value={displayDigits}
            onChangeText={handleDigitsChange}
            onFocus={handleHexFocus}
            placeholder="2D3748"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
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
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    height: SWATCH_SIZE,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    backgroundColor: colors.background,
  },
  hexFieldSelected: {
    borderColor: colors.textPrimary,
    borderWidth: 2.5,
  },
  hexHash: {
    ...typography.body,
    color: colors.textPrimary,
    marginRight: 2,
  },
  hexInputInner: {
    flex: 1,
    height: SWATCH_SIZE,
    padding: 0,
    margin: 0,
    ...typography.body,
    lineHeight: 20,
    color: colors.textPrimary,
    backgroundColor: 'transparent',
    textAlignVertical: 'center',
  },
});
