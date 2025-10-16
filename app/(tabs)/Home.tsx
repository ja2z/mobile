import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Config } from '../../constants/Config';

/**
 * Home Page Component
 * Landing page with a single button to navigate to the Dashboard
 */
export default function Home() {
  const navigation = useNavigation();

  const handleNavigateToDashboard = () => {
    navigation.navigate('Dashboard' as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{Config.APP_NAME}</Text>
        <Text style={styles.subtitle}>
          Access your dashboard and analytics
        </Text>
        
        <TouchableOpacity
          style={styles.dashboardButton}
          onPress={handleNavigateToDashboard}
          activeOpacity={0.8}
          accessibilityLabel="Open Dashboard"
          accessibilityRole="button"
        >
          <Text style={styles.dashboardButtonText}>📊 Open Dashboard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#6D6D70',
    marginBottom: 40,
    textAlign: 'center',
    lineHeight: 24,
  },
  dashboardButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    minHeight: 56, // 44pt + padding for accessibility
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  dashboardButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
