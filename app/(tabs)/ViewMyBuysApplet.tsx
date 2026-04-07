import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MyBuysService } from '../../services/MyBuysService';
import { DashboardView, DashboardViewRef, SkeletonPlaceholder } from '../../components/DashboardView';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { MyBuysPageFooter, MyBuysPage } from '../../components/MyBuysPageFooter';
import { colors, spacing, typography } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';
import type { Applet } from '../../types/mybuys.types';

type ViewMyBuysAppletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ViewMyBuysApplet'>;
type ViewMyBuysAppletScreenRouteProp = RouteProp<RootStackParamList, 'ViewMyBuysApplet'>;

export default function ViewMyBuysApplet() {
  const navigation = useNavigation<ViewMyBuysAppletScreenNavigationProp>();
  const route = useRoute<ViewMyBuysAppletScreenRouteProp>();
  const { appletId } = route.params;

  const dashboardRef = useRef<DashboardViewRef>(null);
  const [appletName, setAppletName] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [embedJwt, setEmbedJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Footer state
  const [footerPages, setFooterPages] = useState<MyBuysPage[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [workbookLoaded, setWorkbookLoaded] = useState(false);

  const { infoModalVisible, setInfoModalVisible, getEmbedUrl, getJWT } = useEmbedUrlInfo(dashboardRef);

  useEffect(() => {
    navigation.setOptions({
      title: appletName || '',
      headerLeft: () => (
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, appletName]);

  useEffect(() => {
    const loadApplet = async () => {
      try {
        setLoading(true);
        setError(null);

        const applets = await MyBuysService.listApplets();
        const applet: Applet | undefined = applets.find(a => a.appletId === appletId);
        if (!applet) throw new Error('Applet not found');

        setAppletName(applet.name);

        // Build footer pages from config
        if (applet.pageFooterConfig?.pages) {
          const visiblePages = applet.pageFooterConfig.pages
            .filter(p => p.showInFooter)
            .map(p => ({ pageId: p.pageId, name: p.name, emoji: p.emoji }));
          setFooterPages(visiblePages);
          if (visiblePages.length > 0) {
            setSelectedPage(visiblePages[0].pageId);
          }
        }

        const result = await MyBuysService.getRegeneratedUrl(appletId);
        setEmbedUrl(result.url);
        setEmbedJwt(result.jwt || null);
        setLoading(false);
      } catch (error: any) {
        if (error.isSessionExpired) {
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        } else if (error.isExpirationError) {
          Alert.alert('Account Expired', error.message || 'Your account has expired.', [
            { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }) },
          ]);
        } else {
          setError(error.message || 'Failed to load applet');
          setLoading(false);
        }
      }
    };
    loadApplet();
  }, [appletId, navigation]);

  // Register workbook loaded callback
  useEffect(() => {
    if (dashboardRef.current) {
      dashboardRef.current.onWorkbookLoaded(() => {
        console.log('[ViewMyBuysApplet] Workbook loaded, showing footer');
        setWorkbookLoaded(true);
      });
    }
  }, [embedUrl]);

  const handlePageSelect = useCallback((pageId: string, pageName: string) => {
    console.log(`[ViewMyBuysApplet] Navigating to page: ${pageName} (${pageId})`);
    setSelectedPage(pageId);
    dashboardRef.current?.sendMessage({
      type: 'workbook:selectednodeid:update',
      selectedNodeId: pageId,
      nodeType: 'page',
    });
  }, []);

  const handleRetry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const applets = await MyBuysService.listApplets();
      const applet = applets.find(a => a.appletId === appletId);
      if (applet) {
        setAppletName(applet.name);
        const result = await MyBuysService.getRegeneratedUrl(appletId);
        setEmbedUrl(result.url);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load applet');
    } finally {
      setLoading(false);
    }
  }, [appletId]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <SkeletonPlaceholder />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={48} color={colors.error} />
          <Text style={styles.errorTitle}>Failed to Load</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.7}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const showFooter = workbookLoaded && footerPages.length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        {embedUrl ? (
          <DashboardView
            ref={dashboardRef}
            initialUrl={embedUrl}
            initialJwt={embedJwt || undefined}
            appletId={appletId}
            appletName={appletName}
          />
        ) : (
          <SkeletonPlaceholder />
        )}
      </View>
      {showFooter && (
        <MyBuysPageFooter
          pages={footerPages}
          selectedPage={selectedPage}
          onPageSelect={handlePageSelect}
        />
      )}
      <EmbedUrlInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        embedUrl={getEmbedUrl()}
        jwt={getJWT()}
        appletId={appletId}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  errorTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
});
