import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { AdminService, type WhitelistUser } from '../services/AdminService';
import { AuthService } from '../services/AuthService';
import { colors, spacing, borderRadius, typography } from '../constants/Theme';
import type { RootStackParamList } from '../app/_layout';

type WhitelistListNavigationProp = StackNavigationProp<RootStackParamList>;

/**
 * Whitelist List Component
 * Displays list of whitelisted users
 */
export function WhitelistList() {
  const navigation = useNavigation<WhitelistListNavigationProp>();
  const [whitelistUsers, setWhitelistUsers] = useState<WhitelistUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWhitelist();
  }, []);

  // Refresh when screen comes into focus (e.g., returning from AddWhitelistUser)
  useFocusEffect(
    React.useCallback(() => {
      loadWhitelist();
    }, [])
  );

  const loadWhitelist = async () => {
    try {
      setLoading(true);
      const response = await AdminService.listWhitelistUsers();
      setWhitelistUsers(response.whitelistUsers);
    } catch (error: any) {
      console.error('Error loading whitelist:', error);
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
        Alert.alert('Error', 'Failed to load whitelist. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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

  const renderWhitelistItem = ({ item }: { item: WhitelistUser }) => (
    <View style={styles.whitelistItem}>
      <View style={styles.whitelistInfo}>
        <Text style={styles.whitelistEmail}>{item.email}</Text>
        <View style={styles.whitelistMeta}>
          <Text style={styles.whitelistMetaText}>
            Role: {item.role} | Expires: {formatDate(item.expirationDate)}
          </Text>
          {item.hasRegistered ? (
            <Text style={styles.registeredText}>
              Registered: {item.registeredAt ? formatDate(item.registeredAt) : 'Yes'}
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
  );

  return (
    <View style={styles.container}>
      {/* Add Button */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddWhitelistUser' as never)}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Whitelist User</Text>
        </TouchableOpacity>
      </View>

      {/* Whitelist List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={whitelistUsers}
          renderItem={renderWhitelistItem}
          keyExtractor={(item) => item.email}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No whitelist users found</Text>
            </View>
          }
        />
      )}
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
  addButton: {
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: spacing.md,
  },
  whitelistItem: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  whitelistInfo: {
    flex: 1,
  },
  whitelistEmail: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
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
});

