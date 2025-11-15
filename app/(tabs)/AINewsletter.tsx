import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';

type AINewsletterRouteProp = RouteProp<RootStackParamList, 'AINewsletter'>;

/**
 * AI Newsletter Page Component
 * Displays the AI Newsletter workbook
 */
export default function AINewsletter() {
  const route = useRoute<AINewsletterRouteProp>();
  const { appletId, appletName } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);
  
  // Use custom hook for embed URL info modal and header button
  const { infoModalVisible, setInfoModalVisible, getEmbedUrl, getJWT } = useEmbedUrlInfo(dashboardRef);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView 
          ref={dashboardRef}
          workbookId={Config.WORKBOOKS.AI_NEWSLETTER}
          appletId={appletId}
          appletName={appletName}
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

