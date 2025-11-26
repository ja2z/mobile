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
import { ChatModal, ChatModalRef } from '../../components/ChatModal';
import { ConversationalAINavigationBar } from '../../components/ConversationalAINavigationBar';
import { Config } from '../../constants/Config';
import { useEmbedUrlInfo } from '../../hooks/useEmbedUrlInfo';
import { ChatMessage } from '../../types/chat.types';
import { spacing } from '../../constants/Theme';

type ConversationalAIRouteProp = RouteProp<RootStackParamList, 'ConversationalAI'>;
type ConversationalAIScreenNavigationProp = StackNavigationProp<RootStackParamList, 'ConversationalAI'>;

/**
 * Conversational AI Page Component
 * Displays the Conversational AI workbook
 */
export default function ConversationalAI() {
  const route = useRoute<ConversationalAIRouteProp>();
  const navigation = useNavigation<ConversationalAIScreenNavigationProp>();
  const { appletId, appletName } = route.params || {};
  const dashboardRef = useRef<DashboardViewRef>(null);
  const chatModalRef = useRef<ChatModalRef>(null);
  
  // Navigation state
  const [selectedPage, setSelectedPage] = useState('yCrP3yCLoa'); // Default to 'Chat'
  const [isFilterActive, setIsFilterActive] = useState(false);
  const [previousPage, setPreviousPage] = useState('yCrP3yCLoa');
  
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
    }
  }, [handleChatOpen, handleChatResponse]);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView 
          ref={dashboardRef}
          workbookId={Config.WORKBOOKS.CONVERSATIONAL_AI}
          appletId={appletId}
          appletName={appletName}
        />
      </View>
      <ConversationalAINavigationBar
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

