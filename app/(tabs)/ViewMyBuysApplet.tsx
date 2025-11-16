import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { StackNavigationProp, RouteProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import { MyBuysService } from '../../services/MyBuysService';
import { AuthService } from '../../services/AuthService';
import { DashboardView } from '../../components/DashboardView';
import { colors, spacing, typography } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';

type ViewMyBuysAppletScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ViewMyBuysApplet'>;
type ViewMyBuysAppletScreenRouteProp = RouteProp<RootStackParamList, 'ViewMyBuysApplet'>;

/**
 * View My Buys Applet Screen Component
 * Displays the applet in an iframe using DashboardView (same as Dashboard.tsx and AINewsletter.tsx)
 */
export default function ViewMyBuysApplet() {
  const navigation = useNavigation<ViewMyBuysAppletScreenNavigationProp>();
  const route = useRoute<ViewMyBuysAppletScreenRouteProp>();
  const { appletId } = route.params;

  const [appletName, setAppletName] = useState<string>('');
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [embedJwt, setEmbedJwt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    navigation.setOptions({
      title: appletName || '', // Show applet name in header, empty string if not loaded yet
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerButton}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, appletName]);

  /**
   * Load applet and get regenerated URL
   */
  useEffect(() => {
    const loadApplet = async () => {
      const startTime = Date.now();
      console.log('[ViewMyBuysApplet] Starting loadApplet for appletId:', appletId);
      
      try {
        setLoading(true);
        setError(null);

        console.log('[ViewMyBuysApplet] Step 1: Loading applets list...');
        const listStartTime = Date.now();
        const applets = await MyBuysService.listApplets();
        const listDuration = Date.now() - listStartTime;
        console.log('[ViewMyBuysApplet] Step 1 complete: Loaded', applets.length, 'applets in', listDuration, 'ms');
        
        const applet = applets.find(a => a.appletId === appletId);
        if (!applet) {
          throw new Error('Applet not found');
        }
        setAppletName(applet.name);
        console.log('[ViewMyBuysApplet] Found applet:', applet.name);

        console.log('[ViewMyBuysApplet] Step 2: Getting regenerated URL...');
        const regenerateStartTime = Date.now();
        const result = await MyBuysService.getRegeneratedUrl(appletId);
        const regenerateDuration = Date.now() - regenerateStartTime;
        console.log('[ViewMyBuysApplet] Step 2 complete: Got regenerated URL in', regenerateDuration, 'ms');
        
        setEmbedUrl(result.url);
        setEmbedJwt(result.jwt || null);
        setLoading(false);
        const totalDuration = Date.now() - startTime;
        console.log('[ViewMyBuysApplet] loadApplet completed successfully in', totalDuration, 'ms');
        console.log('[ViewMyBuysApplet] embedUrl set, WebView should render now');
      } catch (error: any) {
        const totalDuration = Date.now() - startTime;
        console.error('[ViewMyBuysApplet] Error loading applet after', totalDuration, 'ms:', {
          message: error.message,
          name: error.name,
          stack: error.stack,
          appletId,
        });
        
        if (error.isExpirationError) {
          Alert.alert(
            'Account Expired',
            error.message || 'Your account has expired. You can no longer use the app.',
            [
              {
                text: 'OK',
                onPress: async () => {
                  await AuthService.clearSession();
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                  });
                },
              },
            ]
          );
        } else {
          // Show more detailed error message
          const errorMessage = error.message || 'Failed to load applet';
          console.error('[ViewMyBuysApplet] Setting error:', errorMessage);
          setError(errorMessage);
          setLoading(false);
        }
      }
      // Note: Don't set loading to false here - wait for workbook:loaded message
      // The WebView will start loading after embedUrl is set
    };

    loadApplet();
  }, [appletId, navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading applet...</Text>
        </View>
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
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setLoading(true);
              setError(null);
              // Reload
              const loadApplet = async () => {
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
              };
              loadApplet();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        {/* Use DashboardView component - same as Dashboard.tsx and AINewsletter.tsx */}
        {/* DashboardView takes up all available space below the orange header */}
        {embedUrl ? (
          <DashboardView
            initialUrl={embedUrl}
            initialJwt={embedJwt || undefined}
            appletId={appletId}
            appletName={appletName}
          />
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading applet...</Text>
          </View>
        )}
      </View>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
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

