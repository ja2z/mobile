import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

export interface MyBuysPage {
  pageId: string;
  name: string;
  emoji: string;
}

interface MyBuysPageFooterProps {
  pages: MyBuysPage[];
  selectedPage: string;
  onPageSelect: (pageId: string, pageName: string) => void;
}

export const MyBuysPageFooter: React.FC<MyBuysPageFooterProps> = ({
  pages,
  selectedPage,
  onPageSelect,
}) => {
  if (pages.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.pageButtons}>
        {pages.map((page) => {
          const isSelected = selectedPage === page.pageId;
          return (
            <TouchableOpacity
              key={page.pageId}
              style={styles.button}
              onPress={() => onPageSelect(page.pageId, page.name)}
            >
              <Text style={[styles.emoji, isSelected && styles.emojiSelected]}>
                {page.emoji}
              </Text>
              <Text style={[styles.label, isSelected && styles.labelSelected]} numberOfLines={1}>
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
    paddingHorizontal: spacing.sm,
    minWidth: 56,
    minHeight: 56,
  },
  emoji: {
    fontSize: 22,
    marginBottom: spacing.xs,
    opacity: 0.6,
  },
  emojiSelected: {
    opacity: 1,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
    maxWidth: 72,
  },
  labelSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
});
