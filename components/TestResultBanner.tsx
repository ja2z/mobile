import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';

export type TestResult = { success: boolean; message: string };

type Props = {
  result: TestResult | null;
  onDismiss: () => void;
};

export function TestResultBanner({ result, onDismiss }: Props) {
  if (!result) return null;
  const accent = result.success ? colors.success : colors.error;
  return (
    <View style={[styles.container, result.success ? styles.success : styles.error]}>
      <Ionicons
        name={result.success ? 'checkmark-circle' : 'close-circle'}
        size={20}
        color={accent}
        style={styles.icon}
      />
      <Text style={[styles.message, { color: accent }]}>{result.message}</Text>
      <TouchableOpacity
        onPress={onDismiss}
        style={styles.dismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss test result"
        activeOpacity={0.7}
      >
        <Ionicons name="close" size={18} color={accent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  success: { backgroundColor: '#D1FAE5' },
  error: { backgroundColor: '#FEE2E2' },
  icon: { marginTop: 1 },
  message: {
    ...typography.bodySmall,
    marginLeft: spacing.sm,
    flex: 1,
  },
  dismiss: { padding: spacing.xs, marginLeft: spacing.xs },
});
