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
import { InventoryVerificationModal } from '../../components/InventoryVerificationModal';
import { OperationsNavigationBar } from '../../components/OperationsNavigationBar';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { InventoryVerificationData } from '../../types/inventory.types';
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
  
  // Inventory verification modal state
  const [verificationModalVisible, setVerificationModalVisible] = useState(false);
  const [verificationData, setVerificationData] = useState<InventoryVerificationData | null>(null);
  
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

  /**
   * Handle inventory verification request from Sigma workbook
   */
  const handleInventoryVerification = useCallback((eventData: any) => {
    console.log('📦 ===== INVENTORY VERIFICATION REQUESTED =====');
    console.log('📦 Event data:', JSON.stringify(eventData, null, 2));
    
    // Extract data from the event
    // Handle both camelCase and hyphenated field names from Sigma
    const verificationInfo: InventoryVerificationData = {
      sku: eventData.sku || eventData['sku-number'] || 'Unknown SKU',
      productName: eventData.productName || eventData['Product-name'] || 'Unknown Product',
      systemQty: Number(eventData.systemQty || eventData['system-qty'] || eventData['excess-count']) || 0,
      fromStore: eventData.fromStore || eventData['from-store'],
      toStore: eventData.toStore || eventData['to-store'],
      requestedQty: eventData.requestedQty || eventData['requested-qty'] 
        ? Number(eventData.requestedQty || eventData['requested-qty']) 
        : undefined,
    };
    
    console.log('📦 Parsed verification data:', JSON.stringify(verificationInfo, null, 2));
    setVerificationData(verificationInfo);
    setVerificationModalVisible(true);
    
    // Test: Try setting a simple test variable
    setTimeout(() => {
      if (dashboardRef.current) {
        console.log('🧪 TEST: Sending test variable to Sigma...');
        dashboardRef.current.sendMessage({
          type: 'workbook:variables:update',
          variables: {
            'p_test_variable': 999,
          },
        });
      }
    }, 500);
    
    console.log('📦 ===== END INVENTORY VERIFICATION =====\n');
  }, []);

  /**
   * Handle inventory verification confirmation
   */
  const handleInventoryConfirm = useCallback((physicalCount: number, transferQty: number, notes: string) => {
    console.log('📦 ===== INVENTORY CONFIRMED =====');
    console.log('📦 Physical count:', physicalCount);
    console.log('📦 Transfer qty:', transferQty);
    console.log('📦 Notes:', notes);
    
    // Send the verification data back to Sigma
    if (dashboardRef.current) {
      console.log('📦 Sending variables to Sigma...');
      console.log('📦 Physical count type:', typeof physicalCount, 'value:', physicalCount);
      console.log('📦 Transfer qty type:', typeof transferQty, 'value:', transferQty);
      
      const variablesToSend = {
        'p_stockroom_qty': String(physicalCount),
        'p_transfer_qty': String(transferQty),
      };
      console.log('📦 Variables object:', JSON.stringify(variablesToSend, null, 2));
      console.log('📦 Variable types after conversion:', {
        stockroom: typeof variablesToSend['p_stockroom_qty'],
        transfer: typeof variablesToSend['p_transfer_qty']
      });
      
      dashboardRef.current.sendMessage({
        type: 'workbook:variables:update',
        variables: variablesToSend,
      });
      
      console.log('📦 Message sent to Sigma');
    } else {
      console.error('📦 ERROR: dashboardRef.current is null!');
    }
    
    // Close the modal after submission
    setVerificationModalVisible(false);
    
    console.log('📦 ===== END INVENTORY CONFIRMED =====\n');
  }, []);

  /**
   * Register callbacks with DashboardView on mount
   */
  useEffect(() => {
    if (dashboardRef.current) {
      dashboardRef.current.onInventoryVerification(handleInventoryVerification);
    }
  }, [handleInventoryVerification]);

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
      <InventoryVerificationModal
        visible={verificationModalVisible}
        onClose={() => setVerificationModalVisible(false)}
        data={verificationData}
        onConfirm={handleInventoryConfirm}
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

