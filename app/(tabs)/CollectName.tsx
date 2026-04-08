import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CommonActions, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthService } from '../../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import type { RootStackParamList } from '../_layout';

type CollectNameRoute = RouteProp<RootStackParamList, 'CollectName'>;

/**
 * Required first/last name after magic-link registration (non-backdoor).
 * No cancel — user must submit to continue.
 */
export default function CollectName() {
  const navigation = useNavigation();
  const route = useRoute<CollectNameRoute>();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pending = route.params?.pendingDeepLink;

  async function handleSubmit() {
    const f = firstName.trim();
    const l = lastName.trim();
    if (!f.length || !l.length) {
      setError('Please enter your first and last name.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await AuthService.updateProfileName(f, l);

      if (pending) {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          })
        );
        setTimeout(() => {
          navigation.dispatch(
            CommonActions.navigate({
              name: pending.screen,
              params: pending.params,
            })
          );
        }, 100);
      } else {
        navigation.dispatch(
          CommonActions.reset({
            index: 0,
            routes: [{ name: 'Home' }],
          })
        );
      }
    } catch (e: any) {
      const msg = e instanceof Error ? e.message : 'Could not save your name. Try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconCircle}>
            <Ionicons name="person-outline" size={32} color={colors.primary} />
          </View>
          <Text style={styles.title}>Your name</Text>
          <Text style={styles.body}>
            Enter your first and last name to finish setting up your account.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>First name</Text>
            <TextInput
              style={styles.input}
              value={firstName}
              onChangeText={(t) => {
                setFirstName(t);
                setError(null);
              }}
              placeholder="First name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              autoCorrect
              editable={!loading}
              maxLength={100}
              maxFontSizeMultiplier={1.35}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Last name</Text>
            <TextInput
              style={styles.input}
              value={lastName}
              onChangeText={(t) => {
                setLastName(t);
                setError(null);
              }}
              placeholder="Last name"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="words"
              autoCorrect
              editable={!loading}
              maxLength={100}
              maxFontSizeMultiplier={1.35}
            />
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.error} style={{ marginRight: spacing.xs }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Continue</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  iconCircle: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  field: { marginBottom: spacing.md },
  label: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    color: colors.textPrimary,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  errorText: { ...typography.caption, color: colors.error, flex: 1 },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.md,
    minHeight: 48,
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: {
    ...typography.body,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
