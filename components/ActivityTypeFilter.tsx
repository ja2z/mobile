import React from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
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
 */
export function ActivityTypeFilter({ selectedType, onSelectionChange }: ActivityTypeFilterProps) {
  return (
    <View style={styles.container}>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={selectedType || null}
          onValueChange={(value) => onSelectionChange(value)}
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
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  pickerContainer: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
  },
  pickerItem: {
    ...typography.body,
    color: colors.textPrimary,
  },
});

