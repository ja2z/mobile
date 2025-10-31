import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar } from 'expo-status-bar';
import Home from './(tabs)/Home';
import Dashboard from './(tabs)/Dashboard';
import AINewsletter from './(tabs)/AINewsletter';
import { colors } from '../constants/Theme';

// Define the navigation stack parameter list
export type RootStackParamList = {
  Home: undefined;
  Dashboard: undefined;
  AINewsletter: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

/**
 * Root Layout Component
 * Sets up the main navigation structure for the app
 */
export default function RootLayout() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.primary,
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={Home}
          options={{
            title: 'Home',
            headerShown: false, // Hide header for cleaner home page
          }}
        />
        <Stack.Screen 
          name="Dashboard" 
          component={Dashboard}
          options={{
            title: 'Dashboard',
            headerShown: true,
          }}
        />
        <Stack.Screen 
          name="AINewsletter" 
          component={AINewsletter}
          options={{
            title: 'AI Newsletter',
            headerShown: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
