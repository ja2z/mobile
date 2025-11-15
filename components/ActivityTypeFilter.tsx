import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
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

// Common activity types shown in the filter bar
const COMMON_ACTIVITY_TYPES: ActivityType[] = ['login', 'app_launch', 'failed_login'];

interface ActivityTypeFilterProps {
  selectedTypes: ActivityType[];
  onSelectionChange: (types: ActivityType[]) => void;
}

/**
 * Activity Type Filter Component
 * Provides filter bar with common types and modal for all types
 */
export function ActivityTypeFilter({ selectedTypes, onSelectionChange }: ActivityTypeFilterProps) {
  const [showModal, setShowModal] = useState(false);

  const toggleType = (type: ActivityType) => {
    if (selectedTypes.includes(type)) {
      onSelectionChange(selectedTypes.filter(t => t !== type));
    } else {
      onSelectionChange([...selectedTypes, type]);
    }
  };

  const clearAll = () => {
    onSelectionChange([]);
  };

  const selectAll = () => {
    onSelectionChange(ALL_ACTIVITY_TYPES.map(t => t.value));
  };

  const isSelected = (type: ActivityType) => selectedTypes.includes(type);

  const renderFilterChip = (type: ActivityType, label: string) => {
    const selected = isSelected(type);
    return (
      <TouchableOpacity
        key={type}
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={() => toggleType(type)}
        activeOpacity={0.7}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderModalItem = ({ item }: { item: ActivityTypeOption }) => {
    const selected = isSelected(item.value);
    return (
      <TouchableOpacity
        style={[styles.modalItem, selected && styles.modalItemSelected]}
        onPress={() => toggleType(item.value)}
        activeOpacity={0.7}
      >
        <View style={styles.modalItemContent}>
          <Text style={[styles.modalItemText, selected && styles.modalItemTextSelected]}>
            {item.label}
          </Text>
          {selected && (
            <View style={styles.checkmark}>
              <Text style={styles.checkmarkText}>✓</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Filter Bar */}
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterBar}
      >
        {COMMON_ACTIVITY_TYPES.map(type => {
          const option = ALL_ACTIVITY_TYPES.find(t => t.value === type);
          return option ? renderFilterChip(type, option.label) : null;
        })}
        
        {/* More Button */}
        <TouchableOpacity
          style={[styles.chip, styles.moreButton]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.chipText}>
            {selectedTypes.length > COMMON_ACTIVITY_TYPES.length 
              ? `More (${selectedTypes.length - COMMON_ACTIVITY_TYPES.length})`
              : 'More'}
          </Text>
        </TouchableOpacity>

        {/* Clear Button (only show if filters are active) */}
        {selectedTypes.length > 0 && (
          <TouchableOpacity
            style={[styles.chip, styles.clearButton]}
            onPress={clearAll}
            activeOpacity={0.7}
          >
            <Text style={styles.chipText}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Modal for All Activity Types */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter by Activity Type</Text>
              <TouchableOpacity
                onPress={() => setShowModal(false)}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={selectAll}
                activeOpacity={0.7}
              >
                <Text style={styles.actionButtonText}>Select All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={clearAll}
                activeOpacity={0.7}
              >
                <Text style={styles.actionButtonText}>Clear All</Text>
              </TouchableOpacity>
            </View>

            {/* Activity Types List */}
            <FlatList
              data={ALL_ACTIVITY_TYPES}
              renderItem={renderModalItem}
              keyExtractor={(item) => item.value}
              style={styles.modalList}
              contentContainerStyle={styles.modalListContent}
            />

            {/* Footer */}
            <View style={styles.modalFooter}>
              <Text style={styles.modalFooterText}>
                {selectedTypes.length} of {ALL_ACTIVITY_TYPES.length} selected
              </Text>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => setShowModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  filterBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
  moreButton: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  clearButton: {
    backgroundColor: colors.error + '15',
    borderColor: colors.error,
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
    maxHeight: '80%',
    paddingBottom: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  closeButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    fontSize: 20,
  },
  modalActions: {
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  actionButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  actionButtonText: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
  },
  modalList: {
    flex: 1,
  },
  modalListContent: {
    padding: spacing.md,
  },
  modalItem: {
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalItemSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  modalItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  modalItemTextSelected: {
    color: colors.primaryDark,
    fontWeight: '600',
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  modalFooterText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  applyButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  applyButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

