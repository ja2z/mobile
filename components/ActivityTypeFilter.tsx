import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

export type ActivityType = 
  | 'login'
  | 'app_launch'
  | 'applet_launch'
  | 'failed_login'
  | 'token_refresh'
  | 'user_updated'
  | 'user_deactivated'
  | 'whitelist_user_added'
  | 'whitelist_user_deleted';

export interface ActivityTypeOption {
  value: ActivityType;
  label: string;
}

const ALL_ACTIVITY_TYPES: ActivityTypeOption[] = [
  { value: 'login', label: 'Login' },
  { value: 'app_launch', label: 'App Launch' },
  { value: 'applet_launch', label: 'Applet Launch' },
  { value: 'failed_login', label: 'Failed Login' },
  { value: 'token_refresh', label: 'Token Refresh' },
  { value: 'user_updated', label: 'User Updated' },
  { value: 'user_deactivated', label: 'User Deactivated' },
  { value: 'whitelist_user_added', label: 'Whitelist Added' },
  { value: 'whitelist_user_deleted', label: 'Whitelist Deleted' },
];

// Add "All Types" option at the beginning
const PICKER_OPTIONS: Array<{ value: ActivityType | null; label: string }> = [
  { value: null, label: 'All Types' },
  ...ALL_ACTIVITY_TYPES.map(t => ({ value: t.value, label: t.label })),
];


interface ActivityTypeFilterProps {
  selectedType: ActivityType | null;
  onSelectionChange: (type: ActivityType | null) => void;
}

/**
 * Activity Type Filter Component
 * Single-select filter for activity types using iOS-style picker
 * On iOS, shows a button that opens a modal with a native picker wheel
 * On Android, shows a dropdown picker
 */
export function ActivityTypeFilter({ selectedType, onSelectionChange }: ActivityTypeFilterProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [tempSelection, setTempSelection] = useState<ActivityType | null>(selectedType);

  const selectedLabel = PICKER_OPTIONS.find(opt => opt.value === selectedType)?.label || 'All Types';

  const handleConfirm = () => {
    onSelectionChange(tempSelection);
    setShowPicker(false);
  };

  const handleCancel = () => {
    setTempSelection(selectedType);
    setShowPicker(false);
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
          animationType="slide"
          onRequestClose={handleCancel}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
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
                <Picker
                  selectedValue={tempSelection || null}
                  onValueChange={(value) => setTempSelection(value)}
                  style={styles.picker}
                  itemStyle={styles.pickerItem}
                >
                  {PICKER_OPTIONS.map((option) => (
                    <Picker.Item
                      key={option.value || 'all'}
                      label={option.label}
                      value={option.value}
                    />
                  ))}
                </Picker>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Android: Use dropdown picker directly
  return (
    <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedType || null}
          onValueChange={(value) => onSelectionChange(value)}
          style={styles.picker}
          itemStyle={styles.pickerItem}
          dropdownIconColor={colors.textPrimary}
          mode="dropdown"
        >
          {PICKER_OPTIONS.map((option) => (
            <Picker.Item
              key={option.value || 'all'}
              label={option.label}
              value={option.value}
              color={colors.textPrimary}
            />
          ))}
        </Picker>
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
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 120,
    gap: spacing.xs,
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
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md, // Safe area for iOS
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
});

