# AllIn1 Cricket App

A comprehensive React Native mobile application for cricket enthusiasts.

## Features

- **Live Scores**: Real-time cricket match updates
- **Statistics**: Player and team performance analytics  
- **Fixtures**: Upcoming match schedules
- **News**: Latest cricket news and updates

## Project Structure

```
allin1/
├── src/
│   ├── components/      # Reusable UI components
│   ├── screens/         # Screen components
│   ├── navigation/      # Navigation configuration
│   ├── services/        # API and data services
│   └── utils/          # Helper functions
├── android/            # Android-specific code
├── ios/               # iOS-specific code
└── assets/            # Images, fonts, and other assets
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- React Native CLI
- Android Studio (for Android development)
- Xcode (for iOS development - macOS only)

### Installation

1. Navigate to the project directory:
   ```bash
   cd "/Volumes/Extreme SSD/BSB/allin1"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. For iOS, install CocoaPods dependencies:
   ```bash
   cd ios && pod install && cd ..
   ```

### Running the App

#### Android
```bash
npm run android
```

#### iOS
```bash
npm run ios
```

### Development

- Start the Metro bundler:
  ```bash
  npm start
  ```

## Built With

- React Native 0.75.2
- React Navigation 6.x
- React Native Vector Icons
- React Native Gesture Handler

## License

This project is private and proprietary.
