import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminService, type WhitelistUser } from '../services/AdminService';
import { AuthService } from '../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import type { RootStackParamList } from '../app/_layout';

type WhitelistListNavigationProp = StackNavigationProp<RootStackParamList>;

type SortField = 'role' | 'approvedAt' | 'expirationDate' | 'registeredAt';
type SortDirection = 'asc' | 'desc';

/**
 * Whitelist List Component
 * Displays list of whitelisted users
 */
interface WhitelistListProps {
  refreshTrigger?: number;
}

export function WhitelistList({ refreshTrigger }: WhitelistListProps = {}) {
  const navigation = useNavigation<WhitelistListNavigationProp>();
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [sortModalVisible, setSortModalVisible] = useState(false);

  useEffect(() => {
    loadWhitelist();
  }, []);

  // Refresh when refreshTrigger changes (for tab-based navigation)
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      loadWhitelist();
    }
  }, [refreshTrigger]);

  // Refresh when screen comes into focus (e.g., returning from AddWhitelistUser)
  useFocusEffect(
    React.useCallback(() => {
      loadWhitelist();
    }, [])
  );

  const loadWhitelist = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      console.log('[WhitelistList] Loading whitelist users...');
      const response = await AdminService.listWhitelistUsers();
      console.log('[WhitelistList] Response received:', {
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : [],
        whitelistUsers: response?.whitelistUsers,
        whitelistUsersLength: response?.whitelistUsers?.length,
        fullResponse: JSON.stringify(response, null, 2)
      });
      
      const users = response?.whitelistUsers || [];
      console.log('[WhitelistList] Setting whitelist users:', users.length);
      setWhitelistUsers(users);
    } catch (error: any) {
      console.error('[WhitelistList] Error loading whitelist:', {
        error: error,
        message: error?.message,
        stack: error?.stack,
        isExpirationError: error?.isExpirationError
      });
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
        Alert.alert(
          'Error', 
          `Failed to load whitelist: ${error?.message || 'Unknown error'}. Check console for details.`
        );
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    loadWhitelist(true);
  };

  const handleDelete = (email: string) => {
    Alert.alert(
      'Delete Whitelist User',
      `Are you sure you want to remove ${email} from the whitelist?${whitelistUsers.find(u => u.email === email)?.hasRegistered ? ' This user has registered and will also be deactivated.' : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await AdminService.deleteWhitelistUser(email);
              Alert.alert('Success', 'Whitelist user deleted successfully');
              loadWhitelist();
            } catch (error: any) {
              console.error('Error deleting whitelist user:', error);
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
                Alert.alert('Error', 'Failed to delete whitelist user. Please try again.');
              }
            }
          },
        },
      ]
    );
  };

  const handleEditUser = async (email: string) => {
    // Find the user by email and navigate to edit
    try {
      // Get all users and find by email
      const usersResponse = await AdminService.listUsers({
        page: 1,
        limit: 1000, // Get all users to find by email
        emailFilter: email,
      });
      
      const user = usersResponse.users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        // Navigate to edit user - we'll need to pass user to edit modal
        // For now, show a message directing to Users tab
        Alert.alert(
          'Edit User',
          `User ${email} is registered. Please go to the Users tab to edit this user.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Info', 'User not found. They may not have registered yet.');
      }
    } catch (error: any) {
      console.error('Error finding user:', error);
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
        Alert.alert('Error', 'Failed to find user. Please try again.');
      }
    }
  };

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return 'No expiration';
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
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

  const isExpired = (expirationDate?: number): boolean => {
    if (!expirationDate) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= expirationDate;
  };

  // Sort the whitelist users based on selected field and direction
  const sortedWhitelistUsers = useMemo(() => {
    if (!sortField) return whitelistUsers;

    const sorted = [...whitelistUsers].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'role':
          aValue = a.role || '';
          bValue = b.role || '';
          break;
        case 'approvedAt':
          aValue = a.approvedAt ?? 0;
          bValue = b.approvedAt ?? 0;
          break;
        case 'expirationDate':
          aValue = a.expirationDate ?? 0;
          bValue = b.expirationDate ?? 0;
          break;
        case 'registeredAt':
          // For registered users, use registeredAt timestamp; for unregistered, use 0
          aValue = a.hasRegistered ? (a.registeredAt ?? 0) : 0;
          bValue = b.hasRegistered ? (b.registeredAt ?? 0) : 0;
          // Put unregistered users at the end
          if (!a.hasRegistered && b.hasRegistered) return 1;
          if (a.hasRegistered && !b.hasRegistered) return -1;
          break;
      }

      if (sortField === 'role') {
        // String comparison for role
        const comparison = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? comparison : -comparison;
      } else {
        // Numeric comparison for dates
        const comparison = aValue - bValue;
        return sortDirection === 'asc' ? comparison : -comparison;
      }
    });

    return sorted;
  }, [whitelistUsers, sortField, sortDirection]);

  const handleSortSelect = (field: SortField) => {
    // If clicking the same field, toggle direction; otherwise set new field with asc
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setSortModalVisible(false);
  };

  const getSortFieldLabel = (field: SortField): string => {
    switch (field) {
      case 'role':
        return 'Role';
      case 'approvedAt':
        return 'Whitelisted';
      case 'expirationDate':
        return 'Expires';
      case 'registeredAt':
        return 'Registered';
    }
  };

  const renderWhitelistItem = ({ item }: { item: WhitelistUser }) => {
    const expired = isExpired(item.expirationDate);
    
    return (
      <View style={styles.whitelistItem}>
        <Text style={styles.whitelistEmail}>{item.email}</Text>
        <View style={styles.whitelistBottomRow}>
          <View style={styles.whitelistInfo}>
            <View style={styles.whitelistMeta}>
              <Text style={styles.whitelistMetaText}>
                Role: {item.role}
              </Text>
              {item.approvedAt && (
                <Text style={styles.whitelistMetaText}>
                  Whitelisted: {formatDateTime(item.approvedAt)}
                </Text>
              )}
              <Text style={[
                styles.whitelistMetaText,
                expired && styles.expiredText
              ]}>
                Expires: {item.expirationDate ? formatDateTime(item.expirationDate) : 'No expiration'}
              </Text>
              {expired && (
                <Text style={[styles.whitelistMetaText, styles.expiredText]}>
                  Expired
                </Text>
              )}
              {item.hasRegistered ? (
                <Text style={styles.registeredText}>
                  Registered: {item.registeredAt ? formatDateTime(item.registeredAt) : 'Yes'}
                </Text>
              ) : (
                <Text style={styles.notRegisteredText}>Not registered yet</Text>
              )}
            </View>
          </View>
          <View style={styles.whitelistActions}>
            {item.hasRegistered && (
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => handleEditUser(item.email)}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={20} color={colors.primary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDelete(item.email)}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
    </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with Add Button and Sort Button */}
      <View style={styles.header}>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate('AddWhitelistUser' as never)}
            activeOpacity={0.7}
          >
            <Ionicons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Add Whitelist User</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortButton}
            onPress={() => setSortModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons 
              name={sortField ? "filter" : "filter-outline"} 
              size={20} 
              color={sortField ? colors.primary : colors.textSecondary} 
            />
            <Text style={[styles.sortButtonText, sortField && styles.sortButtonTextActive]}>
              Sort
            </Text>
          </TouchableOpacity>
        </View>
        {sortField && (
          <View style={styles.sortIndicator}>
            <Text style={styles.sortIndicatorText}>
              Sorted by: {getSortFieldLabel(sortField)} ({sortDirection === 'asc' ? 'Asc' : 'Desc'})
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSortField(null);
                setSortDirection('asc');
              }}
              style={styles.clearSortButton}
            >
              <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Whitelist List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sortedWhitelistUsers}
          renderItem={renderWhitelistItem}
          keyExtractor={(item) => item.email}
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
              <Text style={styles.emptyText}>No whitelist users found</Text>
            </View>
          }
        />
      )}

      {/* Sort Modal */}
      <Modal
        visible={sortModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSortModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSortModalVisible(false)}
        >
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sort By</Text>
              <TouchableOpacity
                onPress={() => setSortModalVisible(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <View style={styles.sortOptions}>
              {(['role', 'approvedAt', 'expirationDate', 'registeredAt'] as SortField[]).map((field) => (
                <TouchableOpacity
                  key={field}
                  style={[
                    styles.sortOption,
                    sortField === field && styles.sortOptionActive,
                  ]}
                  onPress={() => handleSortSelect(field)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      sortField === field && styles.sortOptionTextActive,
                    ]}
                  >
                    {getSortFieldLabel(field)}
                  </Text>
                  {sortField === field && (
                    <Ionicons
                      name={sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                      size={20}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    padding: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  addButtonText: {
    ...typography.body,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 80,
  },
  sortButtonText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: colors.primary,
  },
  sortIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  sortIndicatorText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  clearSortButton: {
    padding: spacing.xs,
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
  whitelistItem: {
    backgroundColor: colors.background,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  whitelistEmail: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    flexShrink: 1,
  },
  whitelistBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  whitelistInfo: {
    flex: 1,
  },
  whitelistMeta: {
    gap: 2,
  },
  whitelistMetaText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  registeredText: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: '600',
  },
  notRegisteredText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  expiredText: {
    color: colors.error,
    fontWeight: '600',
  },
  whitelistActions: {
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    paddingBottom: spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  modalCloseButton: {
    padding: spacing.xs,
  },
  sortOptions: {
    padding: spacing.md,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.surface,
  },
  sortOptionActive: {
    backgroundColor: colors.primary + '15',
  },
  sortOptionText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  sortOptionTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
});

