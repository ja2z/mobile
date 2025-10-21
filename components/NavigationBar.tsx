import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';

interface NavigationBarProps {
  selectedPage: string;
  onPageSelect: (pageId: string, pageName: string) => void;
  onFilterPress: () => void;
  isFilterActive: boolean;
}

/**
 * Navigation Bar Component
 * Bottom sticky navigation with 4 page buttons and 1 filter button
 */
export const NavigationBar: React.FC<NavigationBarProps> = ({
  selectedPage,
  onPageSelect,
  onFilterPress,
  isFilterActive,
}) => {
  const pages = [
    { id: 'nVSaruy7Wf', name: 'Dash', emoji: '📊' },
    { id: 'Vk5j4ngio3', name: 'Bar', emoji: '📈' },
    { id: 'ADyAhWunig', name: 'Line', emoji: '📉' },
    { id: 'lYEajzgMLj', name: 'Card', emoji: '🃏' },
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
              <Text style={[styles.emoji, isSelected && styles.selectedEmoji]}>
                {page.emoji}
              </Text>
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
          <Text style={[styles.filterEmoji, isFilterActive && styles.filterEmojiActive]}>
            {isFilterActive ? '✓' : '⚙️'}
          </Text>
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
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E5E5',
    paddingVertical: 8,
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 5,
  },
  pageButtons: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 60,
    minHeight: 60,
  },
  emoji: {
    fontSize: 24,
    marginBottom: 4,
    opacity: 0.6,
  },
  selectedEmoji: {
    opacity: 1,
    transform: [{ scale: 1.1 }],
  },
  label: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
  },
  selectedLabel: {
    color: '#007AFF',
    fontWeight: '700',
  },
  filterSection: {
    paddingLeft: 8,
    borderLeftWidth: 1,
    borderLeftColor: '#E5E5E5',
    justifyContent: 'center',
  },
  filterButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 60,
    minWidth: 70,
  },
  filterButtonActive: {
    backgroundColor: '#007AFF10',
    borderRadius: 8,
  },
  filterEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  filterEmojiActive: {
    fontSize: 20,
  },
  filterLabel: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
  },
  filterLabelActive: {
    color: '#007AFF',
    fontWeight: '700',
  },
});

