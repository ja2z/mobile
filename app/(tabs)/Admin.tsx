import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, borderRadius, typography } from '../../constants/Theme';
import { UserList } from '../../components/UserList';
import { WhitelistList } from '../../components/WhitelistList';
import { ActivityLogView } from '../../components/ActivityLogView';

type TabType = 'users' | 'whitelist' | 'activityLog';

/**
 * Admin Screen Component
 * Main admin interface with tabs for Users, Whitelist, and Activity Log
 */
export default function Admin() {
  const [activeTab, setActiveTab] = useState<TabType>('users');
  const [whitelistRefreshTrigger, setWhitelistRefreshTrigger] = useState(0);

  // Refresh whitelist when returning to this screen (e.g., from AddWhitelistUser)
  useFocusEffect(
    React.useCallback(() => {
      if (activeTab === 'whitelist') {
        setWhitelistRefreshTrigger(prev => prev + 1);
      }
    }, [activeTab])
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'users' && styles.tabActive]}
            onPress={() => setActiveTab('users')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="people-outline" 
              size={20} 
              color={activeTab === 'users' ? colors.primary : colors.textSecondary} 
            />
            <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
              Users
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'whitelist' && styles.tabActive]}
            onPress={() => {
              setActiveTab('whitelist');
              // Trigger refresh when switching to whitelist tab
              setWhitelistRefreshTrigger(prev => prev + 1);
            }}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="list-outline" 
              size={20} 
              color={activeTab === 'whitelist' ? colors.primary : colors.textSecondary} 
            />
            <Text style={[styles.tabText, activeTab === 'whitelist' && styles.tabTextActive]}>
              Whitelist
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'activityLog' && styles.tabActive]}
            onPress={() => setActiveTab('activityLog')}
            activeOpacity={0.7}
          >
            <Ionicons 
              name="document-text-outline" 
              size={20} 
              color={activeTab === 'activityLog' ? colors.primary : colors.textSecondary} 
            />
            <Text style={[styles.tabText, activeTab === 'activityLog' && styles.tabTextActive]}>
              Activity Log
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === 'users' && <UserList />}
          {activeTab === 'whitelist' && <WhitelistList refreshTrigger={whitelistRefreshTrigger} />}
          {activeTab === 'activityLog' && <ActivityLogView />}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    flex: 1,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: colors.primary,
  },
  tabText: {
    ...typography.body,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
  },
});

