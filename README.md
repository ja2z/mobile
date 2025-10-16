# Mobile Dashboard App

A simple React Native mobile app built with Expo for internal company demos. The app embeds an iframe displaying charts/dashboards with minimal native UI interactions.

> **📋 Project Rules & Guidelines**: See [`.cursor/rules/project-specific-rule.mdc`](.cursor/rules/project-specific-rule.mdc) for comprehensive development guidelines, coding standards, and AI assistant instructions specific to this project.

## Features

- **Home Page**: Simple landing page with a button to navigate to the Dashboard
- **Dashboard Page**: Contains a WebView embedding a third-party dashboard/charts
- **Persistent Navigation**: Home button visible at bottom of ALL screens to return to home page
- **Error Handling**: Graceful handling of WebView loading errors and network issues

## Tech Stack

- **Framework**: React Native with Expo
- **Language**: TypeScript
- **Primary Target**: iOS (iPhone)
- **Secondary Target**: Android
- **Navigation**: React Navigation v7
- **WebView**: react-native-webview

## Project Structure

```
/app
  - (tabs)/           # Main navigation screens
    - Home.tsx        # Home page with navigation button
    - Dashboard.tsx   # Dashboard page with WebView
  - _layout.tsx       # Root layout with navigation setup
/components
  - HomeButton.tsx    # Persistent home button component
  - DashboardView.tsx # WebView wrapper component
/constants
  - Config.ts         # URLs and configuration
```

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm start
   ```

3. **Run on device**:
   - iOS: `npm run ios` (requires Xcode)
   - Android: `npm run android` (requires Android Studio)
   - Web: `npm run web`

4. **Test with Expo Go**:
   - Install Expo Go app on your iPhone
   - Scan the QR code from the terminal
   - The app will load on your device

## Configuration

The dashboard URL is configured in `/constants/Config.ts`. Currently set to a placeholder URL (`https://example.com`) for development.

To update for production:
1. Open `/constants/Config.ts`
2. Update the `DASHBOARD_URL` value
3. Restart the app

## Development Notes

- The app uses TypeScript for better type safety
- All components follow React Native best practices
- The Home button meets iOS accessibility guidelines (44x44pt minimum hit area)
- WebView includes proper error handling and loading states
- Navigation is simple and flat (no complex nested navigators)

## Testing

- Primary testing on actual iPhone via Expo Go
- Test both iOS and Android before considering feature complete
- Ensure home button works from all screens
- Test WebView loading states and error conditions

## Future Enhancements

- Production dashboard URL integration
- Barcode scanning feature
- Additional native UI interactions
- Performance optimizations
