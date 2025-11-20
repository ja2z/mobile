import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ChatMessage, ChatModalProps } from '../types/chat.types';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';

/**
 * Ref interface for ChatModal
 */
export interface ChatModalRef {
  addAssistantMessage: (message: ChatMessage) => void;
}

/**
 * Native Chat Modal Component
 * Provides a full-screen chat interface for conversational AI
 * Communicates with Sigma workbook via postMessage
 */
export const ChatModal = forwardRef<ChatModalRef, ChatModalProps>(({
  visible,
  onClose,
  sessionId,
  onSendMessage,
}, ref) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;
  
  // Voice recording hook
  const {
    isRecording,
    partialResults,
    startRecording,
    stopRecording,
  } = useVoiceRecording({
    onResult: (text) => {
      console.log('🎤 Voice result:', text);
      setInputValue(text);
    },
    onError: (error) => {
      console.error('🎤 Voice error:', error);
    },
  });
  
  // Pulse animation for recording indicator
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Animate pulse effect during recording
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  // Animate modal entrance/exit
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Track previous visibility to detect when modal opens
  const prevVisibleRef = useRef(visible);
  
  // Reset state when modal opens (regardless of whether sessionId changed)
  useEffect(() => {
    console.log('💬 ChatModal useEffect - visible:', visible, 'sessionId:', sessionId);
    console.log('💬 Previous visible:', prevVisibleRef.current);
    
    // Check if modal just opened (transitioned from false to true)
    const justOpened = visible && !prevVisibleRef.current;
    
    if (justOpened && sessionId) {
      console.log('💬 Modal just opened! Resetting chat state for session:', sessionId);
      setMessages([]);
      setInputValue('');
      setIsWaitingForResponse(false);
    }
    
    // Update the ref for next render
    prevVisibleRef.current = visible;
  }, [visible, sessionId]);

  /**
   * Add a new message to the chat (called when receiving responses from Sigma)
   */
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
    setIsWaitingForResponse(false);
  }, []);

  /**
   * Add an assistant message (called from parent component)
   */
  const addAssistantMessage = useCallback((message: ChatMessage) => {
    console.log('💬 Adding assistant message to chat:', message);
    addMessage(message);
  }, [addMessage]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addAssistantMessage,
  }));

  /**
   * Handle sending a user message
   */
  const handleSend = useCallback(() => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage || isWaitingForResponse) {
      return;
    }

    // Create user message
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      content: trimmedMessage,
      sender: 'user',
      timestamp: new Date(),
    };

    // Add to local state
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsWaitingForResponse(true);

    // Send to Sigma workbook
    onSendMessage(trimmedMessage);
  }, [inputValue, isWaitingForResponse, onSendMessage]);

  /**
   * Handle close with confirmation if there are messages
   */
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  /**
   * Format timestamp for display
   */
  const formatTimestamp = (date: Date): string => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  };

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>Chat</Text>
                {sessionId && (
                  <Text style={styles.headerSubtitle}>Session {sessionId}</Text>
                )}
              </View>
              <View style={styles.headerSpacer} />
            </View>

            {/* Messages Area */}
            <KeyboardAvoidingView
              style={styles.chatContainer}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={0}
            >
              <ScrollView
                ref={scrollViewRef}
                style={styles.messagesScrollView}
                contentContainerStyle={styles.messagesContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {messages.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="chatbubbles-outline" size={64} color={colors.border} />
                    <Text style={styles.emptyStateText}>Start a conversation...</Text>
                  </View>
                ) : (
                  <>
                    {messages.map((message, index) => (
                      <MessageBubble
                        key={message.id}
                        message={message}
                        formatTimestamp={formatTimestamp}
                        shouldAnimate={
                          message.sender === 'assistant' && 
                          index === messages.length - 1 &&
                          isMessageNew(message.timestamp)
                        }
                        scrollViewRef={scrollViewRef}
                      />
                    ))}
                    {isWaitingForResponse && <LoadingIndicator />}
                  </>
                )}
              </ScrollView>

              {/* Input Area */}
              <View style={styles.inputContainer}>
                {/* Recording Indicator */}
                {isRecording && (
                  <View style={styles.recordingIndicator}>
                    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                      <View style={styles.recordingDot} />
                    </Animated.View>
                    <Text style={styles.recordingText}>
                      {partialResults.length > 0 ? partialResults[0] : 'Listening...'}
                    </Text>
                  </View>
                )}
                
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    value={inputValue}
                    onChangeText={setInputValue}
                    placeholder="Type your message..."
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    maxLength={1000}
                    editable={!isWaitingForResponse && !isRecording}
                    returnKeyType="default"
                    blurOnSubmit={false}
                  />
                  
                  {/* Microphone Button */}
                  <TouchableOpacity
                    style={[
                      styles.micButton,
                      isRecording && styles.micButtonRecording,
                      isWaitingForResponse && styles.micButtonDisabled,
                    ]}
                    onPress={isRecording ? stopRecording : startRecording}
                    disabled={isWaitingForResponse}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={isRecording ? 'stop-circle' : 'mic-outline'}
                      size={22}
                      color={
                        isWaitingForResponse
                          ? colors.textSecondary
                          : isRecording
                          ? '#FFFFFF'
                          : colors.primary
                      }
                    />
                  </TouchableOpacity>
                  
                  {/* Send Button */}
                  <TouchableOpacity
                    style={[
                      styles.sendButton,
                      (!inputValue.trim() || isWaitingForResponse || isRecording) && styles.sendButtonDisabled,
                    ]}
                    onPress={handleSend}
                    disabled={!inputValue.trim() || isWaitingForResponse || isRecording}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="send"
                      size={20}
                      color={
                        !inputValue.trim() || isWaitingForResponse || isRecording
                          ? colors.textSecondary
                          : '#FFFFFF'
                      }
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
});

/**
 * Decode text that might be URL-encoded, HTML-encoded, or both
 * Handles various encoding formats that might come from the API
 */
const decodeText = (text: string): string => {
  if (!text) return text;
  
  let decoded = text;
  
  // First, check if it's URL-encoded (contains % characters)
  if (decoded.includes('%')) {
    try {
      // Decode URL encoding (e.g., %20 -> space, %0A -> newline, %F0%9F%A4%94 -> 🤔)
      decoded = decodeURIComponent(decoded);
      console.log('✅ URL decoded message');
    } catch (error) {
      console.warn('⚠️ Failed to URL decode, using original text:', error);
      // If decoding fails, continue with original text
    }
  }
  
  // Then handle HTML entities if present
  if (decoded.includes('&')) {
    decoded = decoded
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&ndash;/g, '\u2013')
      .replace(/&mdash;/g, '\u2014')
      .replace(/&lsquo;/g, '\u2018')
      .replace(/&rsquo;/g, '\u2019')
      .replace(/&ldquo;/g, '\u201C')
      .replace(/&rdquo;/g, '\u201D')
      .replace(/&hellip;/g, '\u2026')
      .replace(/&#x2F;/g, '/')
      .replace(/&#x27;/g, "'")
      .replace(/&#x60;/g, '`');
    
    // Decode numeric character references (decimal)
    decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
      return String.fromCharCode(parseInt(dec, 10));
    });
    
    // Decode numeric character references (hexadecimal)
    decoded = decoded.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }
  
  // Handle escaped unicode characters (e.g., \u0027)
  if (decoded.includes('\\u')) {
    decoded = decoded.replace(/\\u([0-9A-Fa-f]{4})/g, (match, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });
  }
  
  return decoded;
};

/**
 * Check if a message is new (created within the last 30 seconds)
 */
const isMessageNew = (timestamp: Date): boolean => {
  const messageTime = new Date(timestamp).getTime();
  const currentTime = Date.now();
  return (currentTime - messageTime) < 30000; // 30 seconds
};

/**
 * Individual Message Bubble Component with Typewriter Effect
 */
interface MessageBubbleProps {
  message: ChatMessage;
  formatTimestamp: (date: Date) => string;
  shouldAnimate: boolean;
  scrollViewRef: React.RefObject<ScrollView>;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  formatTimestamp, 
  shouldAnimate,
  scrollViewRef 
}) => {
  const isUser = message.sender === 'user';
  
  // Decode the full message content
  const decodedContent = decodeText(message.content);
  
  // Typewriter state
  const [displayedText, setDisplayedText] = useState(shouldAnimate ? '' : decodedContent);
  const [currentIndex, setCurrentIndex] = useState(shouldAnimate ? 0 : decodedContent.length);
  const [isTyping, setIsTyping] = useState(shouldAnimate);
  
  // Typing cursor animation
  const cursorOpacity = useRef(new Animated.Value(1)).current;
  
  // Animate cursor blink
  useEffect(() => {
    if (!isTyping) {
      cursorOpacity.setValue(0);
      return;
    }
    
    const blinkAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(cursorOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(cursorOpacity, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );
    
    blinkAnimation.start();
    return () => blinkAnimation.stop();
  }, [isTyping, cursorOpacity]);
  
  // Auto-scroll during typing
  useEffect(() => {
    if (isTyping && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true });
    }
  }, [displayedText, isTyping, scrollViewRef]);
  
  // Typewriter animation logic
  useEffect(() => {
    if (!isTyping || currentIndex >= decodedContent.length) {
      if (isTyping && currentIndex >= decodedContent.length) {
        // Animation complete
        setTimeout(() => {
          setIsTyping(false);
        }, 200);
      }
      return;
    }
    
    const remainingText = decodedContent.slice(currentIndex);
    
    // Determine chunk size with natural breaking points
    const getChunkSize = (): number => {
      const nextSpace = remainingText.indexOf(' ');
      const nextPunctuation = remainingText.search(/[.,!?;:\n]/);
      const nextNewline = remainingText.indexOf('\n');
      
      // Find the nearest natural break point
      const breakPoints = [nextSpace, nextPunctuation, nextNewline]
        .filter(point => point > 0)
        .sort((a, b) => a - b);
      
      if (breakPoints.length > 0) {
        const nearestBreak = breakPoints[0];
        
        // For very short segments, include the break character
        if (nearestBreak <= 3) {
          return nearestBreak + 1;
        }
        
        // For longer segments, chunk before the break
        if (nearestBreak <= 15) {
          // Random decision to break early or at the natural point
          const shouldBreakEarly = Math.random() > 0.7;
          if (shouldBreakEarly && nearestBreak > 5) {
            return Math.floor(nearestBreak * (0.3 + Math.random() * 0.5));
          }
          return nearestBreak;
        }
      }
      
      // No nearby break points, create artificial chunks
      const baseChunk = 2 + Math.floor(Math.random() * 8); // 2-9 characters
      const variation = Math.random();
      
      if (variation < 0.1) {
        // 10% chance of very small chunk (1-2 chars)
        return 1 + Math.floor(Math.random() * 2);
      } else if (variation < 0.3) {
        // 20% chance of larger chunk (10-20 chars)
        return 10 + Math.floor(Math.random() * 11);
      }
      
      return baseChunk;
    };
    
    const chunkSize = Math.min(getChunkSize(), remainingText.length);
    const chunk = remainingText.slice(0, chunkSize);
    
    // Determine delay based on chunk content and size
    const getDelay = (): number => {
      // Base delay that creates a feeling similar to LLM streaming
      const baseDelay = 20 + Math.random() * 35; // 20-55ms base
      
      // Check if we just finished a sentence
      const lastChar = chunk[chunk.length - 1];
      if (['.', '!', '?'].includes(lastChar)) {
        return baseDelay + 150 + Math.random() * 200; // 170-370ms pause after sentence
      }
      
      // Check for other punctuation
      if ([',', ';', ':'].includes(lastChar)) {
        return baseDelay + 70 + Math.random() * 70; // 90-210ms pause
      }
      
      // Newline gets a medium pause
      if (chunk.includes('\n')) {
        return baseDelay + 100 + Math.random() * 100; // 120-255ms pause
      }
      
      // Occasional random micro-pauses to simulate thinking
      if (Math.random() < 0.15) {
        return baseDelay + 30 + Math.random() * 100; // 50-185ms occasional pause
      }
      
      // Add slight variability based on chunk size
      const sizeMultiplier = 1 + (chunkSize / 20); // Longer chunks = slightly longer delay
      return baseDelay * sizeMultiplier;
    };
    
    const delay = getDelay();
    
    const timeout = setTimeout(() => {
      setDisplayedText(prev => prev + chunk);
      setCurrentIndex(prev => prev + chunkSize);
    }, delay);
    
    return () => clearTimeout(timeout);
  }, [currentIndex, isTyping, decodedContent]);

  return (
    <View style={[styles.messageBubbleContainer, isUser && styles.messageBubbleContainerUser]}>
      <View
        style={[
          styles.messageBubble,
          isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isUser ? styles.messageTextUser : styles.messageTextAssistant,
          ]}
        >
          {displayedText}
          {isTyping && (
            <Animated.Text style={{ opacity: cursorOpacity }}>
              |
            </Animated.Text>
          )}
        </Text>
      </View>
      <Text style={[styles.timestamp, isUser && styles.timestampUser]}>
        {formatTimestamp(message.timestamp)}
      </Text>
    </View>
  );
};

/**
 * Loading Indicator (typing dots)
 */
const LoadingIndicator: React.FC = () => {
  const dot1Anim = useRef(new Animated.Value(0)).current;
  const dot2Anim = useRef(new Animated.Value(0)).current;
  const dot3Anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createDotAnimation = (animValue: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(animValue, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.timing(animValue, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const animation = Animated.parallel([
      createDotAnimation(dot1Anim, 0),
      createDotAnimation(dot2Anim, 133),
      createDotAnimation(dot3Anim, 266),
    ]);

    animation.start();

    return () => animation.stop();
  }, []);

  const createDotStyle = (animValue: Animated.Value) => ({
    opacity: animValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.3, 1],
    }),
    transform: [
      {
        translateY: animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -4],
        }),
      },
    ],
  });

  return (
    <View style={styles.messageBubbleContainer}>
      <View style={[styles.messageBubble, styles.messageBubbleAssistant, styles.loadingBubble]}>
        <View style={styles.loadingDots}>
          <Animated.View style={[styles.loadingDot, createDotStyle(dot1Anim)]} />
          <Animated.View style={[styles.loadingDot, createDotStyle(dot2Anim)]} />
          <Animated.View style={[styles.loadingDot, createDotStyle(dot3Anim)]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8, // Extend hit area to the left edge
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 40,
  },
  chatContainer: {
    flex: 1,
  },
  messagesScrollView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  messagesContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: spacing.xxxl,
  },
  emptyStateText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  messageBubbleContainer: {
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  messageBubbleContainerUser: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.lg,
  },
  messageBubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  messageBubbleAssistant: {
    backgroundColor: colors.background,
    borderBottomLeftRadius: 4,
    ...shadows.small,
  },
  messageText: {
    ...typography.body,
  },
  messageTextUser: {
    color: '#FFFFFF',
  },
  messageTextAssistant: {
    color: colors.textPrimary,
  },
  timestamp: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    marginLeft: spacing.sm,
  },
  timestampUser: {
    marginLeft: 0,
    marginRight: spacing.sm,
  },
  loadingBubble: {
    paddingVertical: spacing.md,
  },
  loadingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  loadingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textSecondary,
  },
  inputContainer: {
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.md,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    minHeight: 44,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    maxHeight: 100,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
  micButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  micButtonRecording: {
    backgroundColor: colors.error,
    borderColor: colors.error,
  },
  micButtonDisabled: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.error,
    marginRight: spacing.sm,
  },
  recordingText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
});

