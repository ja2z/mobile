import React, { useRef, useCallback, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import { getAppletAccentColor } from '../../constants/AppletThemes';
import { clearCardHeroSourceForRoute } from '../../constants/CardHeroTransition';
import { colors } from '../../constants/Theme';

type GenericAppletViewRouteProp = RouteProp<RootStackParamList, 'GenericAppletView'>;
type GenericAppletViewScreenNavigationProp = StackNavigationProp<RootStackParamList, 'GenericAppletView'>;

/**
 * Generic Applet View
 * Replaces AskJAKE, GTM, BBMUsage, AIChat, AINewsletter, AskBigBuys with a single screen.
 * Receives applet data from route params and constructs full embed path.
 */
export default function GenericAppletView() {
  const route = useRoute<GenericAppletViewRouteProp>();
  const navigation = useNavigation<GenericAppletViewScreenNavigationProp>();
  const {
    appletId,
    appletName,
    workbookId,
    slug,
    embedPath,
    name,
    pageId,
    variables,
  } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);

  // Full embed path: slug + '/' + embedPath (e.g., "papercrane-embedding-gcp/workbook")
  const fullEmbedPath = slug && embedPath ? `${slug}/${embedPath}` : undefined;

  const { infoModalVisible, setInfoModalVisible, getEmbedUrl, getJWT } = useEmbedUrlInfo(dashboardRef);

  const handleHomePress = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('Home' as never);
    }
  }, [navigation]);

  const headerAccent = getAppletAccentColor();

  useAppletHeader(navigation, handleHomePress, headerAccent, '#FFFFFF');

  useEffect(() => {
    return () => {
      clearCardHeroSourceForRoute(route.name);
    };
  }, [route.name]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView
          ref={dashboardRef}
          workbookId={workbookId ?? undefined}
          appletId={appletId}
          appletName={appletName || name}
          initialPageId={pageId}
          initialVariables={variables}
          embedPath={fullEmbedPath}
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
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
});
