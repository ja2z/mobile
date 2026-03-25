import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../../constants/Theme';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import { listBuiltInApplets, type BuiltInApplet } from '../../services/BuiltInAppletsService';
import type { RootStackParamList } from '../_layout';

type AppsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Apps'>;

const LIST_SCREEN = 'Apps';
const SPINNER_DELAY_MS = 200;

/**
 * Apps Page Component
 * Displays app applets in a grid layout (fetched from API)
 */
export default function Apps() {
  const navigation = useNavigation<AppsScreenNavigationProp>();
  const [applets, setApplets] = useState<BuiltInApplet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSpinner, setShowSpinner] = useState(false);
  const spinnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    spinnerTimeoutRef.current = setTimeout(() => {
      setShowSpinner(true);
    }, SPINNER_DELAY_MS);

    return () => {
      if (spinnerTimeoutRef.current) clearTimeout(spinnerTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    listBuiltInApplets()
      .then((all) => setApplets(all.filter((a) => a.list_screen === LIST_SCREEN)))
      .catch((err) => console.error('Failed to fetch applets:', err))
      .finally(() => setLoading(false));
  }, []);

  const handleHomePress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  useAppletHeader(navigation, handleHomePress);

  const navigateToApplet = useCallback(
    (applet: BuiltInApplet) => {
      const params = {
        appletId: applet.applet_id,
        appletName: applet.name,
        workbookId: applet.workbook_id ?? undefined,
        slug: applet.slug,
        embedPath: applet.embed_path,
        name: applet.name,
        pageId: applet.initial_page_id || undefined,
      };
      const screen = applet.target_screen === 'conversationalai' ? 'ConversationalAI' : applet.target_screen;
      navigation.navigate(screen as keyof RootStackParamList, params as never);
    },
    [navigation]
  );

  const renderAppletTile = (applet: BuiltInApplet) => (
    <TouchableOpacity
      key={applet.applet_id}
      style={styles.tileButton}
      onPress={() => navigateToApplet(applet)}
      activeOpacity={0.7}
      accessibilityLabel={`${applet.name} - ${applet.subtitle || ''}`}
      accessibilityRole="button"
    >
      <View style={styles.tile}>
        <View style={[styles.tileAccent, { backgroundColor: applet.color || colors.tileColors.orange1 }]} />
        <View style={styles.tileContent}>
          <View style={[styles.iconContainer, { backgroundColor: (applet.color || colors.tileColors.orange1) + '20' }]}>
            <Ionicons name={(applet.icon_name as keyof typeof Ionicons.glyphMap) || 'grid-outline'} size={24} color={applet.color || colors.tileColors.orange1} />
          </View>
          <View style={styles.tileTextContainer}>
            <Text style={styles.tileTitle} numberOfLines={2}>
              {applet.name}
            </Text>
            <Text style={styles.tileSubtitle} numberOfLines={1}>
              {applet.subtitle || ''}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading && showSpinner) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {applets.map(renderAppletTile)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tileButton: {
    width: '48%',
    aspectRatio: 1,
    marginBottom: spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadows.medium,
  },
  tileAccent: {
    height: 6,
  },
  tileContent: {
    flex: 1,
    padding: spacing.md,
    justifyContent: 'space-between',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTextContainer: {
    marginTop: spacing.xs,
  },
  tileTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tileSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
