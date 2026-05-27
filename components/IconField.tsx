import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import { IconPicker } from './IconPicker';

const DEFAULT_FALLBACK_ICON: keyof typeof Ionicons.glyphMap = 'grid-outline';

interface IconFieldProps {
  value: string | null;
  onChange: (name: string) => void;
  accentColor: string;
  label?: string;
}

/**
 * Single-row icon field with a tap-to-open full-height picker sheet.
 * Lets both the My Apps edit screen and the admin canned-applet modal
 * use the same icon-picking surface without nesting a long virtualized
 * grid inside their form ScrollViews.
 */
export function IconField({
  value,
  onChange,
  accentColor,
  label = 'Icon',
}: IconFieldProps) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(value);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (sheetVisible) {
      setPendingValue(value);
      setSearch('');
    }
  }, [sheetVisible, value]);

  const displayIcon = (value ||
    DEFAULT_FALLBACK_ICON) as keyof typeof Ionicons.glyphMap;
  const displayLabel = value || 'Choose icon';

  const handleDone = () => {
    if (pendingValue && pendingValue !== value) {
      onChange(pendingValue);
    }
    setSheetVisible(false);
  };

  const handleCancel = () => {
    setSheetVisible(false);
  };

  return (
    <>
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>{label}</Text>
        <TouchableOpacity
          style={styles.row}
          onPress={() => setSheetVisible(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.iconTile, { backgroundColor: accentColor }]}>
            <Ionicons name={displayIcon} size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.rowText} numberOfLines={1}>
            {displayLabel}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={sheetVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCancel}
      >
        <SafeAreaView style={styles.sheet} edges={['top', 'left', 'right']}>
          <KeyboardAvoidingView
            style={styles.sheetFlex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.sheetHeader}>
              <TouchableOpacity
                onPress={handleCancel}
                style={styles.sheetHeaderButton}
                activeOpacity={0.7}
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>Choose icon</Text>
              <TouchableOpacity
                onPress={handleDone}
                style={styles.sheetHeaderButton}
                activeOpacity={0.7}
                disabled={!pendingValue}
              >
                <Text
                  style={[
                    styles.sheetDoneText,
                    !pendingValue && styles.sheetDoneTextDisabled,
                  ]}
                >
                  Done
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Ionicons
                name="search"
                size={18}
                color={colors.textSecondary}
                style={styles.searchIcon}
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Search icons"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>

            <IconPicker
              value={pendingValue}
              onChange={setPendingValue}
              accentColor={accentColor}
              searchQuery={search}
              style={styles.pickerFill}
              contentContainerStyle={styles.pickerContent}
            />
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fieldContainer: {
    marginBottom: spacing.md,
  },
  label: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    gap: spacing.md,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.background,
  },
  sheetFlex: {
    flex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetHeaderButton: {
    minWidth: 64,
    paddingVertical: spacing.xs,
  },
  sheetTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sheetCancelText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sheetDoneText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
    textAlign: 'right',
  },
  sheetDoneTextDisabled: {
    color: colors.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchIcon: {
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },
  pickerFill: {
    flex: 1,
  },
  pickerContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
});
