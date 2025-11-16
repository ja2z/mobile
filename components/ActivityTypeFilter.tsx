import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Modal,
  Animated,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import { AdminService } from '../services/AdminService';

// ActivityType is now a string (any eventType from DynamoDB)
export type ActivityType = string;

/**
 * Convert eventType string to display label
 * Formats snake_case to Title Case, with special handling for common types
 */
function getActivityTypeLabel(eventType: string): string {
  // Special cases for better readability
  const specialCases: Record<string, string> = {
    login: 'Login',
    app_launch: 'App Launch',
    applet_launch: 'Applet Launch',
    failed_login: 'Failed Login',
    token_refresh: 'Token Refresh',
    user_updated: 'User Updated',
    user_deactivated: 'User Deactivated',
    whitelist_user_added: 'Whitelist Added',
    whitelist_user_deleted: 'Whitelist Deleted',
  };

  if (specialCases[eventType]) {
    return specialCases[eventType];
  }

  // Default: Convert snake_case to Title Case
  return eventType
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}


interface ActivityTypeFilterProps {
  selectedType: ActivityType | null;
  onSelectionChange: (type: ActivityType | null) => void;
}

/**
 * Activity Type Filter Component
 * Single-select filter for activity types using iOS-style picker
 * On iOS, shows a button that opens a modal with a native picker wheel
 * On Android, shows a dropdown picker
 * 
 * Fetches unique activity types from DynamoDB dynamically
 */
export function ActivityTypeFilter({ selectedType, onSelectionChange }: ActivityTypeFilterProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempSelection, setTempSelection] = useState<ActivityType | null>(selectedType);
  const [activityTypes, setActivityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fetch activity types from API on mount
  useEffect(() => {
    async function fetchActivityTypes() {
      try {
        setLoading(true);
        const response = await AdminService.getActivityTypes();
        setActivityTypes(response.activityTypes || []);
      } catch (error) {
        console.error('Error fetching activity types:', error);
        // On error, use empty array (filter will show "All Types" only)
        setActivityTypes([]);
      } finally {
        setLoading(false);
      }
    }

    fetchActivityTypes();
  }, []);

  // Build picker options dynamically
  const pickerOptions = [
    { value: null, label: 'All Types' },
    ...activityTypes.map(type => ({
      value: type,
      label: getActivityTypeLabel(type),
    })),
  ];

  const selectedLabel = pickerOptions.find(opt => opt.value === selectedType)?.label || 'All Types';

  useEffect(() => {
    if (showPicker) {
      // Animate in: fade overlay and slide up content
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 1,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out: fade overlay and slide down content
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [showPicker]);

  const handleConfirm = () => {
    onSelectionChange(tempSelection);
    setShowPicker(false);
  };

  const handleCancel = () => {
    setTempSelection(selectedType);
    setShowPicker(false);
  };

  const handleOverlayPress = () => {
    handleCancel();
  };

  if (Platform.OS === 'ios') {
    return (
      <View style={styles.wrapper}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            setTempSelection(selectedType);
            setShowPicker(true);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>{selectedLabel}</Text>
          <Ionicons name="chevron-down" size={20} color={colors.textSecondary} />
        </TouchableOpacity>

        <Modal
          visible={showPicker}
          transparent={true}
          animationType="none"
          onRequestClose={handleCancel}
        >
          <Animated.View 
            style={[
              styles.modalOverlay,
              {
                opacity: fadeAnim,
              },
            ]}
          >
            <TouchableOpacity
              style={styles.overlayTouchable}
              activeOpacity={1}
              onPress={handleOverlayPress}
            >
              <View style={styles.overlaySpacer} />
            </TouchableOpacity>
            <Animated.View
              style={[
                styles.modalContent,
                {
                  transform: [
                    {
                      translateY: slideAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [400, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={handleCancel} style={styles.modalButton}>
                  <Text style={styles.modalButtonText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Select Activity Type</Text>
                <TouchableOpacity onPress={handleConfirm} style={styles.modalButton}>
                  <Text style={[styles.modalButtonText, styles.modalButtonTextPrimary]}>Done</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.pickerWrapper}>
                {loading ? (
                  <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading types...</Text>
                  </View>
                ) : (
                  <Picker
                    selectedValue={tempSelection || null}
                    onValueChange={(value) => setTempSelection(value)}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {pickerOptions.map((option) => (
                      <Picker.Item
                        key={option.value || 'all'}
                        label={option.label}
                        value={option.value}
                      />
                    ))}
                  </Picker>
                )}
              </View>
            </Animated.View>
          </Animated.View>
        </Modal>
      </View>
    );
  }

  // Android: Use dropdown picker directly
  return (
    <View style={styles.pickerContainer}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading types...</Text>
        </View>
      ) : (
        <Picker
          selectedValue={selectedType || null}
          onValueChange={(value) => onSelectionChange(value)}
          style={styles.picker}
          itemStyle={styles.pickerItem}
          dropdownIconColor={colors.textPrimary}
          mode="dropdown"
        >
          {pickerOptions.map((option) => (
            <Picker.Item
              key={option.value || 'all'}
              label={option.label}
              value={option.value}
              color={colors.textPrimary}
            />
          ))}
        </Picker>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexShrink: 0,
    flex: 0,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 120,
    gap: spacing.xs,
    flexShrink: 0,
  },
  buttonText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 50,
    minWidth: 120,
    flexShrink: 0,
  },
  picker: {
    height: 200,
    width: '100%',
  },
  pickerItem: {
    ...typography.body,
    color: colors.textPrimary,
    fontSize: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  overlayTouchable: {
    flex: 1,
  },
  overlaySpacer: {
    flex: 1,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md, // Safe area for iOS
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
  modalButton: {
    paddingHorizontal: spacing.md,
    minWidth: 60,
  },
  modalButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  modalButtonTextPrimary: {
    color: colors.primary,
    fontWeight: '600',
  },
  pickerWrapper: {
    maxHeight: 300,
  },
  loadingContainer: {
    padding: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

