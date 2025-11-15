import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminService, type ActivityLog as ActivityLogType } from '../services/AdminService';
import { AuthService } from '../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import type { RootStackParamList } from '../app/_layout';
import { Alert } from 'react-native';

type ActivityLogViewNavigationProp = StackNavigationProp<RootStackParamList>;

/**
 * Activity Log View Component
 * Displays paginated activity logs with email filtering
 * Can be embedded in other screens (e.g., Admin tabs)
 */
export function ActivityLogView() {
  const navigation = useNavigation<ActivityLogViewNavigationProp>();
  const [activities, setActivities] = useState<ActivityLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [emailFilter, setEmailFilter] = useState('');

  useEffect(() => {
    loadActivities();
  }, [page, emailFilter]);

  const loadActivities = async () => {
    try {
      setLoading(true);
      const response = await AdminService.getActivityLogs({
        page,
        limit: 50,
        emailFilter: emailFilter || undefined,
      });
      setActivities(response.activities);
      setTotalPages(response.pagination.totalPages);
    } catch (error: any) {
      console.error('Error loading activity logs:', error);
      if (error.isExpirationError) {
        Alert.alert(
          'Account Expired',
          error.message || 'Your account has expired. You can no longer use the app.',
          [
            {
              text: 'OK',
              onPress: async () => {
                await AuthService.clearSession();
                navigation.reset({
                  index: 0,
                  routes: [{ name: 'Login' }],
                });
              },
            },
          ]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  };

  const getEventTypeLabel = (eventType: string): string => {
    const labels: Record<string, string> = {
      login: 'Login',
      app_launch: 'App Launch',
      applet_launch: 'Applet Launch',
      failed_login: 'Failed Login',
      token_refresh: 'Token Refresh',
      user_updated: 'User Updated',
      user_deactivated: 'User Deactivated',
      whitelist_user_added: 'Whitelist Added',
      whitelist_user_deleted: 'Whitelist Deleted',
    };
    return labels[eventType] || eventType;
  };

  const renderActivityItem = ({ item }: { item: ActivityLogType }) => (
    <View style={styles.activityItem}>
      <View style={styles.activityHeader}>
        <Text style={styles.activityEventType}>{getEventTypeLabel(item.eventType)}</Text>
        <Text style={styles.activityTimestamp}>{formatDateTime(item.timestamp)}</Text>
      </View>
      <Text style={styles.activityEmail}>{item.email}</Text>
      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <View style={styles.activityMetadata}>
          {Object.entries(item.metadata)
            .filter(([_, value]) => value !== null && value !== undefined)
            .map(([key, value]) => (
              <Text key={key} style={styles.metadataText}>
                {key}: {String(value)}
              </Text>
            ))}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filter */}
      <View style={styles.filterContainer}>
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by email..."
          value={emailFilter}
          onChangeText={setEmailFilter}
          placeholderTextColor={colors.textSecondary}
        />
      </View>

      {/* Activity List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <FlatList
            data={activities}
            renderItem={renderActivityItem}
            keyExtractor={(item) => item.activityId}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No activity logs found</Text>
              </View>
            }
          />

          {/* Pagination */}
          <View style={styles.pagination}>
            <TouchableOpacity
              style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
              onPress={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              activeOpacity={0.7}
            >
              <Text style={[styles.pageButtonText, page === 1 && styles.pageButtonTextDisabled]}>
                Previous
              </Text>
            </TouchableOpacity>
            <Text style={styles.pageText}>
              Page {page} of {totalPages}
            </Text>
            <TouchableOpacity
              style={[styles.pageButton, page >= totalPages && styles.pageButtonDisabled]}
              onPress={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              activeOpacity={0.7}
            >
              <Text style={[styles.pageButtonText, page >= totalPages && styles.pageButtonTextDisabled]}>
                Next
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  filterContainer: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterInput: {
    ...typography.body,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
  },
  activityItem: {
    backgroundColor: colors.background,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  activityEventType: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  activityTimestamp: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  activityEmail: {
    ...typography.body,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  activityMetadata: {
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metadataText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  pagination: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  pageButton: {
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  pageButtonDisabled: {
    backgroundColor: colors.surface,
    opacity: 0.5,
  },
  pageButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pageButtonTextDisabled: {
    color: colors.textSecondary,
  },
  pageText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});

