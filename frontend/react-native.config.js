module.exports = {
  assets: ['./assets/fonts', './node_modules/react-native-vector-icons/Fonts'],
  dependencies: {
    '@react-native-async-storage/async-storage': {
      platforms: {
        android: {
          sourceDir: '../node_modules/@react-native-async-storage/async-storage/android',
          packageImportPath: 'import com.reactnativecommunity.asyncstorage.AsyncStoragePackage;',
        },
      },
    },
    'react-native-svg': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-svg/android',
          packageImportPath: 'import com.horcrux.svg.SvgPackage;',
        },
      },
    },
    '@react-native-community/datetimepicker': {
      platforms: {
        android: {
          sourceDir: '../node_modules/@react-native-community/datetimepicker/android',
          packageImportPath: 'import com.reactcommunity.rndatetimepicker.RNDateTimePickerPackage;',
          packageInstance: 'new RNDateTimePickerPackage()',
        },
      },
    },
    'react-native-video': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-video/android',
          packageImportPath: 'import com.brentvatne.react.ReactVideoPackage;',
          packageInstance: 'new ReactVideoPackage()',
        },
      },
    },
    // Carries the in-app YouTube player on the live match screen. YouTube has
    // no public stream URL to hand react-native-video, so the only supported
    // way to show a live broadcast inside the app is its iframe player in a
    // WebView.
    'react-native-webview': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-webview/android',
          packageImportPath: 'import com.reactnativecommunity.webview.RNCWebViewPackage;',
          packageInstance: 'new RNCWebViewPackage()',
        },
      },
    },
    // Firebase (push notifications). The app module keeps its ReactPackage in a
    // separate `reactnative` source set, but the import path is what matters here.
    '@react-native-firebase/app': {
      platforms: {
        android: {
          sourceDir: '../node_modules/@react-native-firebase/app/android',
          packageImportPath: 'import io.invertase.firebase.app.ReactNativeFirebaseAppPackage;',
          packageInstance: 'new ReactNativeFirebaseAppPackage()',
        },
      },
    },
    '@react-native-firebase/messaging': {
      platforms: {
        android: {
          sourceDir: '../node_modules/@react-native-firebase/messaging/android',
          packageImportPath: 'import io.invertase.firebase.messaging.ReactNativeFirebaseMessagingPackage;',
          packageInstance: 'new ReactNativeFirebaseMessagingPackage()',
        },
      },
    },
    // Pinned like the others because the RN 0.75 autolinker returns android:null
    // for these — without an explicit entry PackageList() drops them and the
    // native module is missing at runtime.
    'react-native-reanimated': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-reanimated/android',
          packageImportPath: 'import com.swmansion.reanimated.ReanimatedPackage;',
          packageInstance: 'new ReanimatedPackage()',
        },
      },
    },
    'react-native-haptic-feedback': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-haptic-feedback/android',
          packageImportPath: 'import com.mkuczera.RNReactNativeHapticFeedbackPackage;',
          packageInstance: 'new RNReactNativeHapticFeedbackPackage()',
        },
      },
    },
  },
};
