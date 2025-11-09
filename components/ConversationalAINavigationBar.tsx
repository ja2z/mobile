import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

interface ConversationalAINavigationBarProps {
  selectedPage: string;
  onPageSelect: (pageId: string, pageName: string) => void;
  onFilterPress: () => void;
  isFilterActive: boolean;
}

/**
 * Conversational AI Navigation Bar Component
 * Bottom sticky navigation with 4 page buttons (Chat, Ask, Compare, History) and 1 filter button
 */
export const ConversationalAINavigationBar: React.FC<ConversationalAINavigationBarProps> = ({
  selectedPage,
  onPageSelect,
  onFilterPress,
  isFilterActive,
}) => {
  const pages = [
    { id: 'yCrP3yCLoa', name: 'Chat', icon: 'chatbubbles-outline' as const },
    { id: 'CNyZilcqir', name: 'Ask', icon: 'help-circle-outline' as const },
    { id: 'efRWfolUlX', name: 'Compare', icon: 'git-compare-outline' as const },
    { id: 'ekPedGdc26', name: 'History', icon: 'time-outline' as const },
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

      {/* Filter Button */}
      <View style={styles.filterSection}>
        <TouchableOpacity
          style={[styles.filterButton, isFilterActive && styles.filterButtonActive]}
          onPress={onFilterPress}
        >
          <Ionicons 
            name={isFilterActive ? 'checkmark' : 'options-outline'} 
            size={24} 
            color={isFilterActive ? colors.primary : colors.textSecondary}
            style={styles.filterIcon}
          />
          <Text style={[styles.filterLabel, isFilterActive && styles.filterLabelActive]}>
            {isFilterActive ? 'Done' : 'Filter'}
          </Text>
        </TouchableOpacity>
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
    minWidth: 60,
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
  filterSection: {
    paddingLeft: spacing.sm,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    justifyContent: 'center',
  },
  filterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 60,
    minWidth: 70,
  },
  filterButtonActive: {
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.sm,
  },
  filterIcon: {
    marginBottom: spacing.xs,
  },
  filterLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  filterLabelActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});

