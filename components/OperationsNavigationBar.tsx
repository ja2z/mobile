import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

interface OperationsNavigationBarProps {
  selectedPage: string;
  onPageSelect: (pageId: string, pageName: string) => void;
  onFilterPress: () => void;
  isFilterActive: boolean;
}

/**
 * Operations Navigation Bar Component
 * Bottom sticky navigation with 3 page buttons (Analytics, Transfer Requests, Filters)
 */
export const OperationsNavigationBar: React.FC<OperationsNavigationBarProps> = ({
  selectedPage,
  onPageSelect,
  onFilterPress,
  isFilterActive,
}) => {
  const pages = [
    { id: 'JjchtrDl1w', name: 'Analytics', icon: 'analytics-outline' as const },
    { id: 'Jc8Oqr9HNj', name: 'Transfer', icon: 'swap-horizontal-outline' as const },
    { id: 'hkCtcLBQ0N', name: 'Filters', icon: 'options-outline' as const },
  ];

  return (
    <View style={styles.container}>
      {/* Page Navigation Buttons */}
      <View style={styles.pageButtons}>
        {pages.map((page) => {
          const isSelected = selectedPage === page.id;
          return (
            <TouchableOpacity
              key={page.id}
              style={styles.button}
              onPress={() => onPageSelect(page.id, page.name)}
            >
              <Ionicons 
                name={page.icon} 
                size={24} 
                color={isSelected ? colors.primary : colors.textSecondary}
                style={[styles.icon, isSelected && styles.selectedIcon]}
              />
              <Text style={[styles.label, isSelected && styles.selectedLabel]}>
                {page.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    ...shadows.medium,
  },
  pageButtons: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minWidth: 80,
    minHeight: 60,
  },
  icon: {
    marginBottom: spacing.xs,
    opacity: 0.7,
  },
  selectedIcon: {
    opacity: 1,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  selectedLabel: {
    color: colors.primary,
    fontWeight: '700',
  },
});

