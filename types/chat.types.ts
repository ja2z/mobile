/**
 * Type definitions for the native chat interface
 * Used for communication between the mobile app and Sigma workbook
 */

/**
 * Represents a single chat message in the conversation
 */
export interface ChatMessage {
  id: string;
  content: string;
  sender: 'user' | 'assistant';
  timestamp: Date;
  email?: string; // Optional email field for user identification
}

/**
 * Color configuration for the chat interface
 * Simplified version based on the Sigma plugin
 */
export interface ColorConfig {
  backgroundColor: string;
  userBubbleColor: string;
  userTextColor: string;
  assistantBubbleColor: string;
  assistantTextColor: string;
  inputTextColor: string;
  placeholderTextColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  timestampColor: string;
}

/**
 * PostMessage payload types for app ↔ Sigma communication
 */

/**
 * Message sent from app to Sigma workbook to update a variable (send user prompt)
 */
export interface AppToSigmaMessage {
  type: 'workbook:variables:update';
  variables: {
    [key: string]: string;
  };
}

/**
 * Message sent from Sigma to app when chat should open
 */
export interface SigmaOpenChatMessage {
  type: 'chat:open';
  sessionId: string;
}

/**
 * Message sent from Sigma to app with AI response
 */
export interface SigmaChatResponseMessage {
  type: 'chat:response';
  message: {
    id: string;
    content: string;
    sender: 'assistant';
    timestamp: string; // ISO 8601 format
  };
}

/**
 * Union type for all messages coming from Sigma
 */
export type SigmaToAppMessage = SigmaOpenChatMessage | SigmaChatResponseMessage;

/**
 * Props for the ChatModal component
 */
export interface ChatModalProps {
  visible: boolean;
  onClose: () => void;
  sessionId?: string;
  onSendMessage: (message: string) => void;
  onChatResponse?: (callback: (message: ChatMessage) => void) => void;
}

