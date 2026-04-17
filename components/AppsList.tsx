import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  invalidateBuiltInAppletsCache,
  listBuiltInApplets,
  type BuiltInApplet,
} from '../services/BuiltInAppletsService';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import type { RootStackParamList } from '../app/_layout';
import { EditBuiltInAppletColorModal } from './EditBuiltInAppletColorModal';

type AppsListNavigationProp = StackNavigationProp<RootStackParamList>;

const SCREEN_LABELS: Record<string, string> = {
  apps: 'Apps',
  dashboards: 'Dashboards',
  sigmanauts: 'Sigmanauts',
  ai: 'AI',
  operations: 'Operations',
};

function screenLabel(key: string): string {
  return SCREEN_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Apps List Component (Admin)
 * Lists every built-in applet grouped by list_screen, with a color swatch and
 * pencil to open the global color editor. Admin-only — gated by the parent tab.
 */
export function AppsList() {
  const navigation = useNavigation<AppsListNavigationProp>();
  const [applets, setApplets] = useState<BuiltInApplet[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState<BuiltInApplet | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        invalidateBuiltInAppletsCache();
      } else {
        setLoading(true);
      }
      const list = await listBuiltInApplets();
      setApplets(list);
    } catch (err: any) {
      console.error('[AppsList] Failed to load built-in applets', err);
      if (err?.isSessionExpired) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      Alert.alert(
        'Could not load apps',
        err?.message || 'Unknown error fetching built-in applets.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const sections = useMemo(() => {
    const grouped = new Map<string, BuiltInApplet[]>();
    for (const a of applets) {
      const key = a.list_screen || 'other';
      const arr = grouped.get(key) ?? [];
      arr.push(a);
      grouped.set(key, arr);
    }
    return Array.from(grouped.entries())
      .map(([key, data]) => ({
        title: screenLabel(key),
        key,
        data: data
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [applets]);

  const handleSaved = useCallback(
    (appletId: string, newColor: string | null) => {
      setApplets(prev =>
        prev.map(a =>
          a.applet_id === appletId ? { ...a, color: newColor } : a
        )
      );
      setEditing(null);
    },
    []
  );

  const renderItem = ({ item }: { item: BuiltInApplet }) => {
    const swatch = item.color || colors.accentBlue;
    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setEditing(item)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Edit color for ${item.name}`}
      >
        <View style={[styles.swatch, { backgroundColor: swatch }]}>
          <Ionicons
            name={(item.icon_name as keyof typeof Ionicons.glyphMap) || 'grid-outline'}
            size={18}
            color="#FFFFFF"
          />
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {item.color ? item.color.toUpperCase() : 'Default'}
            {item.subtitle ? ` · ${item.subtitle}` : ''}
          </Text>
        </View>
        <Ionicons
          name="create-outline"
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.applet_id}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No built-in apps found</Text>
            </View>
          }
        />
      )}

      <EditBuiltInAppletColorModal
        visible={!!editing}
        applet={editing}
        onClose={() => setEditing(null)}
        onSaved={newColor => {
          if (editing) handleSaved(editing.applet_id, newColor);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowMeta: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
