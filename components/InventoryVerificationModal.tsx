import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { InventoryVerificationModalProps } from '../types/inventory.types';
import { colors, spacing, borderRadius, typography, shadows } from '../constants/Theme';

/**
 * Inventory Verification Modal Component
 * Allows users to verify physical inventory and input transfer quantities
 */
export const InventoryVerificationModal: React.FC<InventoryVerificationModalProps> = ({
  visible,
  onClose,
  data,
  onConfirm,
}) => {
  const [physicalCount, setPhysicalCount] = useState('');
  const [transferQty, setTransferQty] = useState('');
  const [notes, setNotes] = useState('');
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Reset form when modal opens with new data
  useEffect(() => {
    if (visible && data) {
      setPhysicalCount('');
      setTransferQty('');
      setNotes('');
    }
  }, [visible, data]);

  // Validation: Check if transfer qty exceeds physical count
  const showTransferWarning = 
    transferQty && 
    physicalCount && 
    !isNaN(Number(transferQty)) && 
    !isNaN(Number(physicalCount)) &&
    Number(transferQty) > Number(physicalCount);

  // Animate modal entrance/exit
  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [600, 0],
  });

  const handleClose = () => {
    onClose();
  };

  const handleConfirm = () => {
    const physical = Number(physicalCount);
    const transfer = Number(transferQty);

    if (isNaN(physical) || physical < 0) {
      return; // Validation failed
    }

    console.log('📦 Modal: Confirming with values:', { physical, transfer, notes });
    onConfirm(physical, transfer, notes);
    // Modal will be closed by parent component after sending data
  };

  const isValid = physicalCount !== '' && !isNaN(Number(physicalCount)) && Number(physicalCount) >= 0;

  if (!data) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.modalOverlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-down" size={28} color={colors.textPrimary} />
              </TouchableOpacity>
              <View style={styles.headerTitleContainer}>
                <Text style={styles.headerTitle}>Verify Inventory</Text>
                <Text style={styles.headerSubtitle}>📦 Physical Count</Text>
              </View>
              <View style={styles.headerSpacer} />
            </View>

            <KeyboardAvoidingView
              style={styles.formContainer}
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={0}
            >
              <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Product Info */}
                <View style={styles.section}>
                  <Text style={styles.label}>Product</Text>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{data.productName}</Text>
                    <Text style={styles.sku}>SKU: {data.sku}</Text>
                  </View>
                </View>

                {/* Optional Store Info */}
                {(data.fromStore || data.toStore) && (
                  <>
                    {data.fromStore && (
                      <View style={styles.section}>
                        <Text style={styles.label}>From</Text>
                        <Text style={styles.value}>{data.fromStore}</Text>
                      </View>
                    )}
                    {data.toStore && (
                      <View style={styles.section}>
                        <Text style={styles.label}>To</Text>
                        <Text style={styles.value}>{data.toStore}</Text>
                      </View>
                    )}
                  </>
                )}

                <View style={styles.divider} />

                {/* System Count */}
                <View style={styles.section}>
                  <Text style={styles.label}>System Count</Text>
                  <Text style={styles.value}>{data.systemQty} units</Text>
                </View>

                {/* Requested Quantity (if available) */}
                {data.requestedQty !== undefined && (
                  <View style={styles.section}>
                    <Text style={styles.label}>Requested Quantity</Text>
                    <Text style={[styles.value, styles.requestedQty]}>
                      {data.requestedQty} units
                    </Text>
                  </View>
                )}

                {/* Physical Count Input */}
                <View style={styles.section}>
                  <Text style={styles.label}>Physical Count *</Text>
                  <TextInput
                    style={styles.input}
                    value={physicalCount}
                    onChangeText={setPhysicalCount}
                    placeholder="Enter your count"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                  <Text style={styles.hint}>
                    👆 Enter your actual warehouse count
                  </Text>
                </View>

                <View style={styles.divider} />

                {/* Available to Transfer (manual input) */}
                <View style={styles.section}>
                  <Text style={styles.label}>Available to Transfer</Text>
                  <TextInput
                    style={styles.input}
                    value={transferQty}
                    onChangeText={setTransferQty}
                    placeholder="Enter quantity to transfer"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="numeric"
                    returnKeyType="next"
                  />
                  {showTransferWarning && (
                    <Text style={styles.warningHint}>
                      ⚠️ Transfer quantity exceeds physical count
                    </Text>
                  )}
                  {physicalCount && !showTransferWarning && (
                    <Text style={styles.hint}>
                      Enter quantity to transfer (max: {physicalCount} units)
                    </Text>
                  )}
                </View>

                <View style={styles.divider} />

                {/* Notes */}
                <View style={styles.section}>
                  <Text style={styles.label}>Notes (Optional)</Text>
                  <TextInput
                    style={styles.textArea}
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="e.g., Items in warehouse section B"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    numberOfLines={3}
                    maxLength={500}
                    returnKeyType="default"
                  />
                </View>
              </ScrollView>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                <View style={styles.buttonDivider} />
                <View style={styles.buttonRow}>
                  <TouchableOpacity
                    style={[styles.button, styles.cancelButton]}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-outline" size={20} color={colors.textPrimary} style={styles.buttonIcon} />
                    <Text style={styles.cancelButtonText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      styles.confirmButton,
                      !isValid && styles.confirmButtonDisabled,
                    ]}
                    onPress={handleConfirm}
                    disabled={!isValid}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={styles.buttonIcon} />
                    <Text style={styles.confirmButtonText}>Submit Verification</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerSpacer: {
    width: 44,
  },
  formContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  section: {
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  value: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  productInfo: {
    backgroundColor: colors.background,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productName: {
    ...typography.body,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  sku: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  requestedQty: {
    color: colors.info,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  textArea: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  warningHint: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.xs,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.lg,
  },
  buttonContainer: {
    backgroundColor: colors.background,
  },
  buttonDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? spacing.xxl : spacing.lg,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 56,
  },
  buttonIcon: {
    marginRight: spacing.xs,
  },
  cancelButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  confirmButton: {
    backgroundColor: colors.primary,
    flex: 1.5,
    ...shadows.small,
  },
  confirmButtonDisabled: {
    backgroundColor: colors.border,
    opacity: 0.6,
  },
  confirmButtonText: {
    ...typography.body,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

