# Development Guide

This document provides development guidelines and context for the Mobile Dashboard App project.

## 📋 Project Rules & Context

**Primary Reference**: [`.cursor/rules/project-specific-rule.mdc`](.cursor/rules/project-specific-rule.mdc)

This file contains the complete project context including:
- Project overview and tech stack
- Core requirements and app structure
- Navigation and WebView implementation guidelines
- Code style and conventions
- File structure and component guidelines
- Development workflow and testing approach
- Dependencies and deployment notes
- AI assistant instructions

## Quick Reference

### Tech Stack
- **Framework**: React Native with Expo
- **Language**: TypeScript (preferred for AI assistance)
- **Primary Target**: iOS (iPhone)
- **Navigation**: React Navigation v7 with stack navigator
- **WebView**: react-native-webview for dashboard embedding

### Key Principles
1. **Simplicity First**: Keep components simple and functional
2. **TypeScript**: Always use TypeScript for better type safety
3. **Error Handling**: Include proper error handling for WebView and navigation
4. **Accessibility**: Ensure 44x44pt minimum hit areas for interactive elements
5. **Expo Compatibility**: Stay within Expo managed workflow

### File Structure
```
/app
  - (tabs)/           # Main navigation screens
  - _layout.tsx       # Root layout
/components
  - HomeButton.tsx    # Persistent home button component
  - DashboardView.tsx # WebView wrapper component
/constants
  - Config.ts         # URLs and configuration
/services
  - EmbedUrlService.ts # API service for embed URLs
```

### Current Development Phase
**Phase 1: MVP Development**
- ✅ Home page with button
- ✅ Dashboard page with iframe
- ✅ Persistent home button on all screens
- ✅ Basic navigation working
- ✅ Dynamic embed URL fetching with auto-refresh

### Testing
- Primary testing on actual iPhone via Expo Go
- Test both iOS and Android before considering features complete
- Ensure home button works from all screens
- Test WebView loading states and error conditions

## Getting Started

1. Review the project rules: [`.cursor/rules/project-specific-rule.mdc`](.cursor/rules/project-specific-rule.mdc)
2. Install dependencies: `npm install`
3. Start development server: `npm start`
4. Test on device using Expo Go app

## AI Assistant Context

When working with AI assistants on this project, they should:
1. Always reference the project-specific rules
2. Use TypeScript for all new code
3. Prioritize simplicity over complex patterns
4. Include error handling and comments
5. Follow Expo best practices
6. Ensure compatibility with Expo Go (avoid native modules requiring custom dev builds)

For detailed AI assistant instructions, see the "AI Assistant Instructions" section in the project rules file.
