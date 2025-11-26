import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { OperationsNavigationBar } from '../../components/OperationsNavigationBar';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { spacing } from '../../constants/Theme';

type OperationsRouteProp = RouteProp<RootStackParamList, 'Operations'>;
type OperationsScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Operations'>;

/**
 * Operations Page Component
 * Displays the Operations workbook with Analytics, Transfer Requests, and Filters tabs
 */
export default function Operations() {
  const route = useRoute<OperationsRouteProp>();
  const navigation = useNavigation<OperationsScreenNavigationProp>();
  const { appletId, appletName } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);
  
  // Navigation state
  const [selectedPage, setSelectedPage] = useState('JjchtrDl1w'); // Default to 'Analytics'
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [previousPage, setPreviousPage] = useState('JjchtrDl1w');
  
  // Use custom hook for embed URL info modal and header button
  const { infoModalVisible, setInfoModalVisible, getEmbedUrl, getJWT } = useEmbedUrlInfo(dashboardRef);

  /**
   * Handle home button press
   * Uses goBack() to animate in the opposite direction (back animation)
   */
  const handleHomePress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      // Fallback: navigate to Home if we can't go back
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  /**
   * Set up navigation header with Home button
   */
  useEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={handleHomePress}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityLabel="Go to Home"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleHomePress]);

  /**
   * Handle page selection from navigation bar
   */
  const handlePageSelect = (pageId: string, pageName: string) => {
    console.log(`📱 Navigating to page: ${pageName} (${pageId})`);
    setSelectedPage(pageId);
    setIsFilterActive(false);
    
    // Send postMessage to iframe to change page
    dashboardRef.current?.sendMessage({
      type: 'workbook:selectednodeid:update',
      selectedNodeId: pageId,
      nodeType: 'page',
    });
  };

  /**
   * Handle filter button press (not used in this navigation bar, but kept for consistency)
   */
  const handleFilterPress = () => {
    // This navigation bar doesn't have a separate filter button
    // Filters is one of the main tabs
    console.log('📱 Filter press (no-op for Operations)');
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView 
          ref={dashboardRef}
          workbookId={Config.WORKBOOKS.OPERATIONS}
        />
      </View>
      <OperationsNavigationBar
        selectedPage={selectedPage}
        onPageSelect={handlePageSelect}
        onFilterPress={handleFilterPress}
        isFilterActive={isFilterActive}
      />
      <EmbedUrlInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        embedUrl={getEmbedUrl()}
        jwt={getJWT()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
  headerButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
});

