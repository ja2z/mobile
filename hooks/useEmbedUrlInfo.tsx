import React, { useState, useLayoutEffect, RefObject } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { DashboardViewRef } from '../components/DashboardView';

/**
 * Return type for useEmbedUrlInfo hook
 */
interface UseEmbedUrlInfoReturn {
  infoModalVisible: boolean;
  setInfoModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  getEmbedUrl: () => string | null;
  getJWT: () => string | null;
}

/**
 * Custom hook to manage the embed URL info modal and header button
 * Provides a reusable way to add the info button to screens with DashboardView
 */
export function useEmbedUrlInfo(dashboardRef: RefObject<DashboardViewRef | null>): UseEmbedUrlInfoReturn {
  const navigation = useNavigation();
  const [infoModalVisible, setInfoModalVisible] = useState(false);

  // Set header right button with info icon
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setInfoModalVisible(true)}
          style={styles.headerButton}
          activeOpacity={0.7}
          accessibilityLabel="Show URL details"
          accessibilityRole="button"
        >
          <Ionicons name="information-circle" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  // Helper functions to get URL and JWT from DashboardView ref
  const getEmbedUrl = () => {
    return dashboardRef.current?.getUrl() || null;
  };

  const getJWT = () => {
    return dashboardRef.current?.getJWT() || null;
  };

  return {
    infoModalVisible,
    setInfoModalVisible,
    getEmbedUrl,
    getJWT,
  };
}

const styles = StyleSheet.create({
  headerButton: {
    padding: 8,
    marginRight: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

