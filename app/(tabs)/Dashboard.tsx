import React, { useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { NavigationBar } from '../../components/NavigationBar';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';

type DashboardRouteProp = RouteProp<RootStackParamList, 'Dashboard'>;

/**
 * Dashboard Page Component
 * Contains the WebView with embedded dashboard content and bottom navigation
 */
export default function Dashboard() {
  const route = useRoute<DashboardRouteProp>();
  const { appletId, appletName } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);
  const [selectedPage, setSelectedPage] = useState('nVSaruy7Wf'); // Default to 'Dash'
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [previousPage, setPreviousPage] = useState('nVSaruy7Wf');
  
  // Use custom hook for embed URL info modal and header button
  const { infoModalVisible, setInfoModalVisible, getEmbedUrl, getJWT } = useEmbedUrlInfo(dashboardRef);

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
        />
      </View>
      <NavigationBar
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
});
