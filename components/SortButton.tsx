import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

export type SortDirection = 'asc' | 'desc';

export interface SortOption<T extends string> {
  value: T;
  label: string;
}

interface SortButtonProps<T extends string> {
  options: SortOption<T>[];
  currentSortField: T | null;
  sortDirection: SortDirection;
  onSortSelect: (field: T) => void;
  onClearSort: () => void;
  getSortFieldLabel?: (field: T) => string;
}

/**
 * Reusable Sort Button Component
 * Displays a sort button that opens a modal with sort options
 * Shows sort indicator when a sort is active
 */
export function SortButton<T extends string>({
  options,
  currentSortField,
  sortDirection,
  onSortSelect,
  onClearSort,
  getSortFieldLabel,
}: SortButtonProps<T>) {
  const [modalVisible, setModalVisible] = useState(false);

  const handleSortSelect = (field: T) => {
    onSortSelect(field);
    setModalVisible(false);
  };

  const getLabel = (field: T): string => {
    if (getSortFieldLabel) {
      return getSortFieldLabel(field);
    }
    return options.find(opt => opt.value === field)?.label || field;
  };

  return (
    <>
      <TouchableOpacity
        style={styles.sortButton}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
      >
        <Ionicons 
          name={currentSortField ? "filter" : "filter-outline"} 
          size={20} 
          color={currentSortField ? colors.primary : colors.textSecondary} 
        />
        <Text style={[styles.sortButtonText, currentSortField && styles.sortButtonTextActive]}>
          Sort
        </Text>
      </TouchableOpacity>

      {/* Sort Modal */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort By</Text>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.sortOptions}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.sortOption,
                    currentSortField === option.value && styles.sortOptionActive,
                  ]}
                  onPress={() => handleSortSelect(option.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      currentSortField === option.value && styles.sortOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {currentSortField === option.value && (
                    <Ionicons
                      name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                      size={20}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 80,
  },
  sortButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: colors.primary,
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
    paddingBottom: spacing.xl,
    maxHeight: '80%',
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
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  sortOptions: {
    padding: spacing.md,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  sortOptionActive: {
    backgroundColor: colors.primary + '15',
  },
  sortOptionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});

