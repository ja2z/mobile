import React, { useRef, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { useAppletHeader } from '../../hooks/useAppletHeader';

type BBMUsageRouteProp = RouteProp<RootStackParamList, 'BBMUsage'>;
type BBMUsageScreenNavigationProp = StackNavigationProp<RootStackParamList, 'BBMUsage'>;

/**
 * BBM Usage Page Component
 * Displays the BBM Usage Analytics workbook
 */
export default function BBMUsage() {
  const route = useRoute<BBMUsageRouteProp>();
  const navigation = useNavigation<BBMUsageScreenNavigationProp>();
  const { appletId, appletName, pageId, variables } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);
  
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

  // Set up navigation header with Home button and consistent styling
  useAppletHeader(navigation, handleHomePress);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView 
          ref={dashboardRef}
          workbookId={Config.WORKBOOKS.BBM_USAGE}
          appletId={appletId}
          appletName={appletName}
          initialPageId={pageId}
          initialVariables={variables}
          embedPath="papercrane-embedding-gcp/workbook"
        />
      </View>
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

