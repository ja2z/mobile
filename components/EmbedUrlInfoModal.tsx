import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface EmbedUrlInfoModalProps {
  visible: boolean;
  onClose: () => void;
  embedUrl: string | null;
  jwt?: string | null;
}

/**
 * Base64 decode function for React Native
 * Uses atob if available (polyfilled in Expo), otherwise implements manual decoder
 */
function base64Decode(str: string): string {
  // Check if atob is available (polyfilled in Expo)
  if (typeof atob !== 'undefined') {
    return atob(str);
  }
  
  // Manual base64 decoder for React Native
  // Base64 character set
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  
  str = str.replace(/[^A-Za-z0-9\+\/\=]/g, '');
  
  for (let i = 0; i < str.length; i += 4) {
    const enc1 = chars.indexOf(str.charAt(i));
    const enc2 = chars.indexOf(str.charAt(i + 1));
    const enc3 = chars.indexOf(str.charAt(i + 2));
    const enc4 = chars.indexOf(str.charAt(i + 3));
    
    const chr1 = (enc1 << 2) | (enc2 >> 4);
    const chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
    const chr3 = ((enc3 & 3) << 6) | enc4;
    
    output += String.fromCharCode(chr1);
    
    if (enc3 !== 64) {
      output += String.fromCharCode(chr2);
    }
    if (enc4 !== 64) {
      output += String.fromCharCode(chr3);
    }
  }
  
  return output;
}

/**
 * Decode base64url string to regular base64
 */
function base64UrlDecode(str: string): string {
  // Replace URL-safe characters with regular base64 characters
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // Add padding if needed
  while (base64.length % 4) {
    base64 += '=';
  }
  
  return base64;
}

/**
 * Decode JWT payload
 */
function decodeJWT(jwt: string): any | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const payload = parts[1];
    const decoded = base64UrlDecode(payload);
    const jsonPayload = base64Decode(decoded);
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Error decoding JWT:', error);
    return null;
  }
}

/**
 * Extract JWT from URL if not provided directly
 */
function extractJWTFromUrl(url: string): string | null {
  try {
    // Look for ?:jwt= or &:jwt= pattern
    const jwtMatch = url.match(/[?&]:jwt=([^&]+)/);
    if (jwtMatch && jwtMatch[1]) {
      return jwtMatch[1];
    }
    
    // Also try standard query parameter format
    const urlObj = new URL(url);
    const jwtParam = urlObj.searchParams.get('jwt');
    if (jwtParam) {
      return jwtParam;
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting JWT from URL:', error);
    return null;
  }
}

/**
 * Embed URL Info Modal Component
 * Displays the embed URL and decoded JWT payload
 */
export function EmbedUrlInfoModal({ visible, onClose, embedUrl, jwt }: EmbedUrlInfoModalProps) {
  const [decodedJWT, setDecodedJWT] = useState<any | null>(null);
  const [jwtString, setJwtString] = useState<string | null>(null);

  useEffect(() => {
    if (visible && embedUrl) {
      // Get JWT from prop or extract from URL
      let jwtToDecode = jwt;
      if (!jwtToDecode) {
        jwtToDecode = extractJWTFromUrl(embedUrl);
      }
      
      if (jwtToDecode) {
        setJwtString(jwtToDecode);
        const decoded = decodeJWT(jwtToDecode);
        setDecodedJWT(decoded);
      } else {
        setJwtString(null);
        setDecodedJWT(null);
      }
    }
  }, [visible, embedUrl, jwt]);

  const formatJWTValue = (value: any): string => {
    if (value === null || value === undefined) {
      return 'undefined';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  };

  /**
   * Render URL with JWT payload highlighted in orange with black background
   */
  const renderHighlightedUrl = () => {
    if (!embedUrl) {
      return <Text style={styles.urlText}>Not available</Text>;
    }

    // Find the JWT in the URL
    const jwtMatch = embedUrl.match(/([?&]:jwt=)([^&]+)/);
    if (jwtMatch) {
      const jwtValue = jwtMatch[2];
      // Split JWT into HEADER.PAYLOAD.SIGNATURE
      const jwtParts = jwtValue.split('.');
      if (jwtParts.length === 3) {
        const header = jwtParts[0];
        const payload = jwtParts[1];
        const signature = jwtParts[2];
        
        const beforeJWT = embedUrl.substring(0, jwtMatch.index! + jwtMatch[1].length);
        const afterJWT = embedUrl.substring(jwtMatch.index! + jwtMatch[0].length);

        return (
          <Text style={styles.urlText}>
            {beforeJWT}
            {header}.
            <Text style={styles.jwtPayloadInUrl}>{payload}</Text>
            .{signature}
            {afterJWT}
          </Text>
        );
      }
      
      // If JWT format is unexpected, highlight whole thing
      const beforeJWT = embedUrl.substring(0, jwtMatch.index! + jwtMatch[1].length);
      const afterJWT = embedUrl.substring(jwtMatch.index! + jwtMatch[0].length);
      return (
        <Text style={styles.urlText}>
          {beforeJWT}
          <Text style={styles.jwtInUrl}>{jwtValue}</Text>
          {afterJWT}
        </Text>
      );
    }

    // Fallback: try standard jwt parameter
    const standardJwtMatch = embedUrl.match(/([?&]jwt=)([^&]+)/);
    if (standardJwtMatch) {
      const jwtValue = standardJwtMatch[2];
      // Split JWT into HEADER.PAYLOAD.SIGNATURE
      const jwtParts = jwtValue.split('.');
      if (jwtParts.length === 3) {
        const header = jwtParts[0];
        const payload = jwtParts[1];
        const signature = jwtParts[2];
        
        const beforeJWT = embedUrl.substring(0, standardJwtMatch.index! + standardJwtMatch[1].length);
        const afterJWT = embedUrl.substring(standardJwtMatch.index! + standardJwtMatch[0].length);

        return (
          <Text style={styles.urlText}>
            {beforeJWT}
            {header}.
            <Text style={styles.jwtPayloadInUrl}>{payload}</Text>
            .{signature}
            {afterJWT}
          </Text>
        );
      }
      
      // If JWT format is unexpected, highlight whole thing
      const beforeJWT = embedUrl.substring(0, standardJwtMatch.index! + standardJwtMatch[1].length);
      const afterJWT = embedUrl.substring(standardJwtMatch.index! + standardJwtMatch[0].length);
      return (
        <Text style={styles.urlText}>
          {beforeJWT}
          <Text style={styles.jwtInUrl}>{jwtValue}</Text>
          {afterJWT}
        </Text>
      );
    }

    // No JWT found, return as-is
    return <Text style={styles.urlText}>{embedUrl}</Text>;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.overlayTouchable} />
        </TouchableWithoutFeedback>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>URL DETAILS</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close modal"
            >
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView 
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
            bounces={true}
            scrollEventThrottle={16}
          >
                  {/* URL DETAILS Section */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>URL DETAILS</Text>
                    {renderHighlightedUrl()}
                  </View>

                  {/* DESCRIPTION Section */}
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>DESCRIPTION</Text>
                    <Text style={styles.descriptionText}>
                      The JSON Web Token (JWT) data is used for user authentication and authorization.
                      It consists of several parts that support Content Authorization, Data Authorization and Feature Authorization.
                    </Text>
                  </View>

                  {/* JWT DATA Section */}
                  {decodedJWT && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>JWT DATA</Text>
                      <View style={styles.jwtContainer}>
                        <Text style={styles.jwtOpenBrace}>{'{'}</Text>
                        {Object.entries(decodedJWT).map(([key, value], index) => {
                          const valueStr = formatJWTValue(value);
                          return (
                            <View key={key} style={styles.jwtClaim}>
                              <Text style={styles.jwtLine}>
                                <Text style={styles.jwtKey}>{`"${key}"`}</Text>
                                <Text style={styles.jwtColon}>: </Text>
                                <Text style={styles.jwtValue}>{valueStr}</Text>
                              </Text>
                            </View>
                          );
                        })}
                        <Text style={styles.jwtCloseBrace}>{'}'}</Text>
                      </View>
                    </View>
                  )}

                  {!decodedJWT && embedUrl && (
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>JWT DATA</Text>
                      <Text style={styles.errorText}>Unable to decode JWT</Text>
                    </View>
                  )}
              </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  overlayTouchable: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 500,
    height: SCREEN_HEIGHT * 0.85,
    ...shadows.medium,
    overflow: 'hidden',
    flexDirection: 'column',
    zIndex: 10,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexShrink: 0,
    minHeight: 60,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeButton: {
    padding: spacing.sm,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  urlText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  jwtInUrl: {
    ...typography.bodySmall,
    color: colors.primary,
    fontFamily: 'monospace',
    lineHeight: 20,
  },
  jwtPayloadInUrl: {
    ...typography.bodySmall,
    color: colors.primary,
    backgroundColor: '#000000',
    fontFamily: 'monospace',
    lineHeight: 20,
    paddingHorizontal: 2,
  },
  descriptionText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  valueText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  jwtContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  jwtOpenBrace: {
    ...typography.body,
    color: '#000000',
    fontFamily: 'monospace',
    marginBottom: spacing.xs,
  },
  jwtClaim: {
    marginLeft: spacing.md,
    marginBottom: spacing.xs,
  },
  jwtLine: {
    ...typography.bodySmall,
    fontFamily: 'monospace',
    color: '#000000',
    lineHeight: 20,
  },
  jwtKey: {
    ...typography.bodySmall,
    fontFamily: 'monospace',
    color: '#000000',
  },
  jwtColon: {
    ...typography.bodySmall,
    fontFamily: 'monospace',
    color: '#000000',
  },
  jwtValue: {
    ...typography.bodySmall,
    fontFamily: 'monospace',
    color: '#000000',
  },
  jwtCloseBrace: {
    ...typography.body,
    color: '#000000',
    fontFamily: 'monospace',
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.bodySmall,
    color: colors.error,
  },
});

