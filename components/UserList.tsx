import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminService, type User } from '../services/AdminService';
import { AuthService } from '../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import type { RootStackParamList } from '../app/_layout';

type UserListNavigationProp = StackNavigationProp<RootStackParamList>;

interface UserListProps {
  initialEmailFilter?: string;
  initialShowDeactivated?: boolean;
}

/**
 * User List Component
 * Displays list of users with pagination, filtering, and sorting
 */
export function UserList({ initialEmailFilter, initialShowDeactivated }: UserListProps = {}) {
  const navigation = useNavigation<UserListNavigationProp>();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [emailFilter, setEmailFilter] = useState(initialEmailFilter || '');
  const [sortBy, setSortBy] = useState<'email' | 'createdAt' | 'lastActiveAt'>('createdAt');
  const [showDeactivated, setShowDeactivated] = useState(initialShowDeactivated || false);

  // Update filters when initial props change (e.g., navigating from whitelist)
  useEffect(() => {
    if (initialEmailFilter !== undefined) {
      setEmailFilter(initialEmailFilter);
    }
    if (initialShowDeactivated !== undefined) {
      setShowDeactivated(initialShowDeactivated);
    }
  }, [initialEmailFilter, initialShowDeactivated]);

  useEffect(() => {
    loadUsers();
  }, [page, emailFilter, sortBy, showDeactivated]);

  // Refresh when screen comes into focus (e.g., returning from EditUser)
  useFocusEffect(
    React.useCallback(() => {
      loadUsers();
    }, [page, emailFilter, sortBy, showDeactivated])
  );

  const loadUsers = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const response = await AdminService.listUsers({
        page,
        limit: 20,
        emailFilter: emailFilter || undefined,
        sortBy,
        showDeactivated,
      });
      setUsers(response.users);
      setTotalPages(response.pagination.totalPages);
    } catch (error: any) {
      console.error('Error loading users:', error);
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
      } else {
        Alert.alert('Error', 'Failed to load users. Please try again.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadUsers(true);
  };

  const handleEdit = (user: User) => {
    navigation.navigate('EditUser' as never, { user } as never);
  };

  const handleDeactivate = (user: User) => {
    Alert.alert(
      'Deactivate User',
      `Are you sure you want to deactivate ${user.email}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              await AdminService.deactivateUser(user.userId);
              Alert.alert('Success', 'User deactivated successfully');
              loadUsers();
            } catch (error: any) {
              console.error('Error deactivating user:', error);
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
              } else {
                Alert.alert('Error', 'Failed to deactivate user. Please try again.');
              }
            }
          },
        },
      ]
    );
  };


  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (timestamp?: number): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp * 1000);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Los_Angeles',
    });
  };

  const renderUserItem = ({ item }: { item: User }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <Text style={styles.userEmail}>{item.email}</Text>
        <View style={styles.userMeta}>
          <Text style={styles.userMetaText}>
            Role: {item.role} | Created: {formatDate(item.createdAt)}
          </Text>
          {item.lastActiveAt && (
            <Text style={styles.userMetaText}>
              Last Active: {formatDateTime(item.lastActiveAt)}
            </Text>
          )}
          {item.isDeactivated && (
            <Text style={[styles.userMetaText, styles.deactivatedText]}>Deactivated</Text>
          )}
          {item.expirationDate && (
            <Text style={styles.userMetaText}>
              Expires: {formatDateTime(item.expirationDate)}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.userActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEdit(item)}
          activeOpacity={0.7}
        >
          <Ionicons name="create-outline" size={20} color={colors.primary} />
        </TouchableOpacity>
        {!item.isDeactivated && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDeactivate(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="ban-outline" size={20} color={colors.error} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Filters */}
      <View style={styles.filters}>
        <TextInput
          style={styles.filterInput}
          placeholder="Filter by email..."
          value={emailFilter}
          onChangeText={setEmailFilter}
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => {
            const options: ('email' | 'createdAt' | 'lastActiveAt')[] = ['email', 'createdAt', 'lastActiveAt'];
            const currentIndex = options.indexOf(sortBy);
            const nextIndex = (currentIndex + 1) % options.length;
            setSortBy(options[nextIndex]);
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.sortButtonText}>Sort: {sortBy}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, showDeactivated && styles.toggleButtonActive]}
          onPress={() => setShowDeactivated(!showDeactivated)}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleButtonText, showDeactivated && styles.toggleButtonTextActive]}>
            Show Deactivated
          </Text>
        </TouchableOpacity>
      </View>

      {/* User List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <FlatList
            data={users}
            renderItem={renderUserItem}
            keyExtractor={(item) => item.userId}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No users found</Text>
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
              <Ionicons name="chevron-back" size={20} color={page === 1 ? colors.textSecondary : colors.primary} />
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
              <Ionicons name="chevron-forward" size={20} color={page >= totalPages ? colors.textSecondary : colors.primary} />
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
  filters: {
    flexDirection: 'row',
    padding: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  filterInput: {
    flex: 1,
    ...typography.body,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  sortButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  toggleButton: {
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleButtonActive: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  toggleButtonText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  toggleButtonTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
    flexGrow: 1,
  },
  userItem: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  userMeta: {
    gap: 2,
  },
  userMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  deactivatedText: {
    color: colors.error,
    fontWeight: '600',
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionButton: {
    padding: spacing.sm,
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
  },
  pageButtonDisabled: {
    opacity: 0.5,
  },
  pageText: {
    ...typography.body,
    color: colors.textPrimary,
  },
});

