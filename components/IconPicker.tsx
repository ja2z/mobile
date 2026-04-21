import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

export interface IconPickerProps {
  value: string | null;
  onChange: (name: string) => void;
  accentColor: string;
}

/**
 * Curated set of Ionicons for the compact default view.
 * 8 icons laid out as 4 columns x 2 rows.
 */
const CURATED_ICONS: ReadonlyArray<keyof typeof Ionicons.glyphMap> = [
  'grid-outline',
  'apps-outline',
  'bar-chart-outline',
  'cart-outline',
  'cash-outline',
  'chatbubble-outline',
  'briefcase-outline',
  'analytics-outline',
];

const BROWSE_CAP = 200;
const BROWSE_COLUMNS = 6;

/**
 * Compact icon picker: 4x2 curated grid by default with a "Browse all"
 * affordance that expands an inline searchable list covering the full
 * Ionicons.glyphMap. Stage-only — selection never auto-saves.
 */
export function IconPicker({ value, onChange, accentColor }: IconPickerProps) {
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState('');

  const allIconNames = useMemo(
    () => Object.keys(Ionicons.glyphMap).sort() as Array<keyof typeof Ionicons.glyphMap>,
    []
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allIconNames;
    return allIconNames.filter((n) => n.toLowerCase().includes(q));
  }, [allIconNames, query]);

  const visible = filtered.slice(0, BROWSE_CAP);
  const truncated = filtered.length > BROWSE_CAP;

  const renderTile = (
    name: keyof typeof Ionicons.glyphMap,
    size: number,
    glyphSize: number
  ) => {
    const selected = value === name;
    return (
      <TouchableOpacity
        key={name}
        onPress={() => onChange(name)}
        activeOpacity={0.7}
        style={[
          styles.tile,
          { width: size, height: size },
          selected
            ? { backgroundColor: accentColor, borderColor: accentColor }
            : styles.tileUnselected,
        ]}
      >
        <Ionicons
          name={name}
          size={glyphSize}
          color={selected ? '#FFFFFF' : colors.textPrimary}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <View style={styles.curatedGrid}>
        {CURATED_ICONS.map((name) => renderTile(name, 56, 22))}
      </View>

      <TouchableOpacity
        onPress={() => setBrowsing((b) => !b)}
        activeOpacity={0.7}
        style={styles.browseButton}
      >
        <Text style={styles.browseText}>
          {browsing ? 'Hide' : 'Browse all'}
        </Text>
        <Ionicons
          name={browsing ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {browsing && (
        <View style={styles.browsePanel}>
          <View style={styles.searchWrap}>
            <Ionicons
              name="search-outline"
              size={16}
              color={colors.textSecondary}
              style={styles.searchLeadingIcon}
            />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search icons"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                activeOpacity={0.7}
                style={styles.clearButton}
              >
                <Ionicons
                  name="close-circle"
                  size={18}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={visible}
            keyExtractor={(item) => item}
            numColumns={BROWSE_COLUMNS}
            style={styles.browseList}
            contentContainerStyle={styles.browseListContent}
            columnWrapperStyle={styles.browseRow}
            nestedScrollEnabled
            initialNumToRender={48}
            windowSize={5}
            removeClippedSubviews
            renderItem={({ item }) => renderTile(item, 40, 18)}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No icons match “{query}”.</Text>
            }
            ListFooterComponent={
              truncated ? (
                <Text style={styles.footerText}>
                  Showing {BROWSE_CAP} of {filtered.length}. Refine your search
                  to see more.
                </Text>
              ) : null
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  curatedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileUnselected: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  browseButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  browseText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  browsePanel: {
    marginTop: spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    minHeight: 44,
  },
  searchLeadingIcon: {
    marginRight: spacing.sm,
  },
  searchInput: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    paddingVertical: spacing.sm,
  },
  clearButton: {
    marginLeft: spacing.sm,
    padding: spacing.xs,
  },
  browseList: {
    marginTop: spacing.sm,
    maxHeight: 220,
  },
  browseListContent: {
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  browseRow: {
    gap: spacing.sm,
  },
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  footerText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
});
