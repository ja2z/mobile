import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { NavigationBar } from '../../components/NavigationBar';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { spacing } from '../../constants/Theme';

type DashboardRouteProp = RouteProp<RootStackParamList, 'Dashboard'>;
type DashboardScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Dashboard'>;

/**
 * Dashboard Page Component
 * Contains the WebView with embedded dashboard content and bottom navigation
 */
export default function Dashboard() {
  const route = useRoute<DashboardRouteProp>();
  const navigation = useNavigation<DashboardScreenNavigationProp>();
  const { appletId, appletName, pageId, variables } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);
  
  // Log route params for debugging
  useEffect(() => {
    console.log('📱 ===== DASHBOARD SCREEN =====');
    console.log('📱 Route params:', JSON.stringify(route.params, null, 2));
    console.log('📱 Extracted values:');
    console.log('📱   appletId:', appletId);
    console.log('📱   appletName:', appletName);
    console.log('📱   pageId:', pageId);
    console.log('📱   variables:', JSON.stringify(variables, null, 2));
    console.log('📱 Passing to DashboardView:');
    console.log('📱   initialPageId:', pageId);
    console.log('📱   initialVariables:', JSON.stringify(variables, null, 2));
    console.log('📱 ===== END DASHBOARD SCREEN =====');
  }, [route.params, appletId, appletName, pageId, variables]);
  
  // Define pages for navigation bar
  const pages = [
    { id: 'nVSaruy7Wf', name: 'Dash', icon: 'grid-outline' as const },
    { id: 'Vk5j4ngio3', name: 'Bar', icon: 'bar-chart-outline' as const },
    { id: 'ADyAhWunig', name: 'Line', icon: 'trending-up-outline' as const },
    { id: 'lYEajzgMLj', name: 'Card', icon: 'card-outline' as const },
  ];
  
  // Determine initial selected page: use pageId from deep link if it exists in pages array, otherwise default
  const getInitialSelectedPage = () => {
    if (pageId && pages.some(p => p.id === pageId)) {
      return pageId;
    }
    return 'nVSaruy7Wf'; // Default to 'Dash'
  };
  
  const [selectedPage, setSelectedPage] = useState(getInitialSelectedPage());
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [previousPage, setPreviousPage] = useState(getInitialSelectedPage());
  
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
   * Handle filter button press
   * When filter is not active: navigate to filter page
   * When filter is active: return to previous page
   */
  const handleFilterPress = () => {
    if (!isFilterActive) {
      // Navigate to filter page
      console.log('📱 Opening filter page');
      setPreviousPage(selectedPage); // Remember current page
      setIsFilterActive(true);
      
      // Send postMessage to navigate to filter page
      dashboardRef.current?.sendMessage({
        type: 'workbook:selectednodeid:update',
        selectedNodeId: '6SuAlIRhQ_',
        nodeType: 'page',
      });
    } else {
      // Return to previous page
      console.log(`📱 Closing filter page, returning to previous page: ${previousPage}`);
      setIsFilterActive(false);
      setSelectedPage(previousPage);
      
      // Send postMessage to return to previous page
      dashboardRef.current?.sendMessage({
        type: 'workbook:selectednodeid:update',
        selectedNodeId: previousPage,
        nodeType: 'page',
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView 
          ref={dashboardRef}
          workbookId={Config.WORKBOOKS.AOP_EXEC_DASHBOARD}
          appletId={appletId}
          appletName={appletName}
          initialPageId={pageId}
          initialVariables={variables}
        />
      </View>
      <NavigationBar
        pages={pages}
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
