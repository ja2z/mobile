import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../_layout';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { EmbedUrlInfoModal } from '../../components/EmbedUrlInfoModal';
import { ChatModal, ChatModalRef } from '../../components/ChatModal';
import { NavigationBar } from '../../components/NavigationBar';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { useAppletHeader } from '../../hooks/useAppletHeader';
import { getAppletAccentColor } from '../../constants/AppletThemes';
import { clearCardHeroSourceForRoute } from '../../constants/CardHeroTransition';
import { colors } from '../../constants/Theme';
import { ChatMessage } from '../../types/chat.types';

type ConversationalAIRouteProp = RouteProp<RootStackParamList, 'ConversationalAI'>;
type ConversationalAIScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ConversationalAI'>;

/**
 * Conversational AI Page Component
 * Displays the Conversational AI workbook
 */
export default function ConversationalAI() {
  const route = useRoute<ConversationalAIRouteProp>();
  const navigation = useNavigation<ConversationalAIScreenNavigationProp>();
  const { appletId, appletName, workbookId, slug, embedPath, name, pageId, variables, color: routeColor } = route.params || {};
  const fullEmbedPath = slug && embedPath ? `${slug}/${embedPath}` : 'papercrane-embedding-gcp/workbook';
  const resolvedWorkbookId = workbookId || '5vuwQqluzlA5gmq9A82vt7';
  const dashboardRef = useRef<DashboardViewRef>(null);
  const chatModalRef = useRef<ChatModalRef>(null);
  
  // Define pages for navigation bar
  const pages = [
    { id: 'yCrP3yCLoa', name: 'Chat', icon: 'chatbubbles-outline' as const },
    { id: 'CNyZilcqir', name: 'Ask', icon: 'help-circle-outline' as const },
    { id: 'efRWfolUlX', name: 'Compare', icon: 'git-compare-outline' as const },
    { id: 'ekPedGdc26', name: 'History', icon: 'time-outline' as const },
  ];
  
  // Determine initial selected page: use pageId from deep link if it exists in pages array, otherwise default
  const getInitialSelectedPage = () => {
    if (pageId && pages.some(p => p.id === pageId)) {
      return pageId;
    }
    return 'yCrP3yCLoa'; // Default to 'Chat'
  };
  
  // Navigation state
  const [selectedPage, setSelectedPage] = useState(getInitialSelectedPage());
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [previousPage, setPreviousPage] = useState(getInitialSelectedPage());
  const [workbookLoaded, setWorkbookLoaded] = useState(false);
  
  // Chat modal state
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | undefined>(undefined);
  
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

  const headerAccent = routeColor || getAppletAccentColor();

  useAppletHeader(navigation, handleHomePress, headerAccent, '#FFFFFF');

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
        selectedNodeId: 'yZPNVxjoKE',
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

  /**
   * Handle opening the native chat modal when sessionId changes in Sigma
   */
  const handleChatOpen = useCallback((sessionId: string) => {
    console.log('💬 ===== OPENING CHAT MODAL =====');
    console.log('💬 New sessionId:', sessionId);
    console.log('💬 Current sessionId:', currentSessionId);
    console.log('💬 Modal currently visible:', chatModalVisible);
    setCurrentSessionId(sessionId);
    setChatModalVisible(true);
    console.log('💬 ===== END OPENING CHAT MODAL =====\n');
  }, [currentSessionId, chatModalVisible]);

  /**
   * Handle chat response from Sigma workbook
   */
  const handleChatResponse = useCallback((response: any) => {
    console.log('💬 ===== CHAT RESPONSE RECEIVED =====');
    console.log('💬 Full response object:', JSON.stringify(response, null, 2));
    console.log('💬 Response content:', response.content);
    console.log('💬 Response content type:', typeof response.content);
    console.log('💬 Response content length:', response.content?.length);
    
    // Convert response to ChatMessage format
    const assistantMessage: ChatMessage = {
      id: response.id || `assistant-${Date.now()}`,
      content: response.content,
      sender: 'assistant',
      timestamp: response.timestamp ? new Date(response.timestamp) : new Date(),
    };
    
    console.log('💬 Formatted message for display:', JSON.stringify(assistantMessage, null, 2));
    console.log('💬 ===== END CHAT RESPONSE =====\n');
    
    // Add message to the chat modal
    if (chatModalRef.current) {
      chatModalRef.current.addAssistantMessage(assistantMessage);
    }
  }, []);

  /**
   * Handle sending a message from the native chat
   */
  const handleSendMessage = useCallback((message: string) => {
    console.log('💬 Sending message from native chat:', message);
    if (dashboardRef.current) {
      dashboardRef.current.sendChatPrompt(message);
    }
  }, []);

  /**
   * Handle closing the chat modal
   */
  const handleChatClose = useCallback(() => {
    console.log('💬 Closing chat modal');
    setChatModalVisible(false);
    
    // Clear the sessionId in Sigma so the incrementor can trigger a new change
    if (dashboardRef.current) {
      console.log('💬 Clearing p_bubble_session_id in Sigma workbook');
      const clearMessage = {
        type: 'workbook:variables:update',
        variables: {
          'p_bubble_session_id': '',
        },
      };
      dashboardRef.current.sendMessage(clearMessage);
    }
  }, []);

  /**
   * Register callbacks with DashboardView on mount
   */
  useEffect(() => {
    if (dashboardRef.current) {
      dashboardRef.current.onChatOpen(handleChatOpen);
      dashboardRef.current.onChatResponse(handleChatResponse);
      dashboardRef.current.onWorkbookLoaded(() => {
        console.log('📊 ConversationalAI: Workbook loaded, showing navigation bar');
        setWorkbookLoaded(true);
      });
    }
  }, [handleChatOpen, handleChatResponse]);

  // Clear this screen's hero source on unmount.
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
          workbookId={resolvedWorkbookId}
          appletId={appletId}
          appletName={appletName || name}
          initialPageId={pageId}
          initialVariables={variables}
          embedPath={fullEmbedPath}
        />
      </View>
      {workbookLoaded && (
        <NavigationBar
          pages={pages}
          selectedPage={selectedPage}
          onPageSelect={handlePageSelect}
          onFilterPress={handleFilterPress}
          isFilterActive={isFilterActive}
        />
      )}
      <EmbedUrlInfoModal
        visible={infoModalVisible}
        onClose={() => setInfoModalVisible(false)}
        embedUrl={getEmbedUrl()}
        jwt={getJWT()}
      />
      <ChatModal
        ref={chatModalRef}
        visible={chatModalVisible}
        onClose={handleChatClose}
        sessionId={currentSessionId}
        onSendMessage={handleSendMessage}
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

