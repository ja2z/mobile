import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DashboardView, DashboardViewRef } from '../../components/DashboardView';
import { Config } from '../../constants/Config';

/**
 * AI Newsletter Page Component
 * Displays the AI Newsletter workbook
 */
export default function AINewsletter() {
  const dashboardRef = useRef<DashboardViewRef>(null);

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.content}>
        <DashboardView 
          ref={dashboardRef}
          workbookId={Config.WORKBOOKS.AI_NEWSLETTER}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    margin: 0,
    padding: 0,
  },
});

