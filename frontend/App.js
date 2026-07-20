import React, {useState, useEffect} from 'react';
import {StatusBar, Text as RNText, TextInput as RNTextInput} from 'react-native';
import 'react-native-gesture-handler';

// Clamp global font scaling. A large system font ("Display size" / accessibility
// large text) would otherwise enlarge every label while fixed-height cards, chips
// and score rows stay put — causing text to overflow / overwrite on real devices.
// Users can still enlarge text up to this cap; past it, layout integrity wins.
// Applied once here so it covers every <Text>/<TextInput> app-wide.
const MAX_FONT_SCALE = 1.2;
RNText.defaultProps = RNText.defaultProps || {};
RNText.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;
RNTextInput.defaultProps = RNTextInput.defaultProps || {};
RNTextInput.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE;
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import AuthNavigator from './src/navigation/AuthNavigator';
import { registerForPush } from './src/services/push';
import { loadSelectedSport } from './src/utils/selectedSport';
import AppNavigator from './src/navigation/AppNavigator';
import SportPickerScreen from './src/screens/SportPickerScreen';
import RummyHomeScreen from './src/sports/rummy/screens/RummyHomeScreen';
import RummyNewGameScreen from './src/sports/rummy/screens/RummyNewGameScreen';
import RummyGameScreen from './src/sports/rummy/screens/RummyGameScreen';
import SplashScreen from './src/components/SplashScreen';
import { ToastHost } from './src/components/Toast';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import legendsApi from './src/services/LegendsApi';
import { applyServerConfigs } from './src/sports/scoring';

const Stack = createStackNavigator();

// ⚙️ DEV ONLY — bypass the login/OTP screens and start straight on the app so
// you can develop & test in-app flows without signing in.
// Flip the right-hand side to `true` for local work; the `__DEV__` guard means
// it can NEVER reach a release build (this shipped enabled once — hence the guard).
const DEV_BYPASS_LOGIN = __DEV__ && false;

const Root = () => {
  const { colors, isDark } = useTheme();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  // Restore a saved session on launch so reopening the app doesn't re-prompt OTP.
  useEffect(() => {
    // Restore the active sport BEFORE the first screens read it, otherwise
    // every sport-scoped query on launch runs with no filter — and the Arena
    // picker centres cricket instead of what you last played. Gated on `ready`
    // so nothing mounts until the value is in place (it's read synchronously
    // during render, so resolving it later would be too late).
    Promise.all([loadSelectedSport(), legendsApi.loadToken()]).then(([, token]) => {
      setIsAuthenticated(!!token);
      setReady(true);
      // Returning user: hand this device's FCM token to the backend so match
      // and award pushes reach it. Fire-and-forget — never blocks start-up.
      if (token) registerForPush();
    });
    // Hydrate the polymorphic sport rules from the DB (SportConfiguration).
    // Fire-and-forget: bundled config is the fallback if this fails or the
    // backend is older than this endpoint, so scoring never depends on it.
    legendsApi.getSportConfigs().then((res) => {
      if (res.success) applyServerConfigs(res.data);
    }).catch(() => {});
  }, []);

  if (!ready) {
    // branded splash while we read the persisted token
    return <SplashScreen />;
  }

  return (
    <>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bg}
      />
      <NavigationContainer>
          <Stack.Navigator
          id="RootStack"
          screenOptions={{ headerShown: false, animationEnabled: false, cardStyle: { backgroundColor: colors.bg } }}
          initialRouteName={(DEV_BYPASS_LOGIN) ? 'MainApp' : (isAuthenticated ? 'SportPicker' : 'Auth')}
        >
          <Stack.Screen name="Auth" component={AuthNavigator} />
          {/* SportPicker shown on every launch after auth */}
          <Stack.Screen name="SportPicker" component={SportPickerScreen} />
          <Stack.Screen name="RummyHome" component={RummyHomeScreen} />
          <Stack.Screen name="RummyNewGame" component={RummyNewGameScreen} />
          <Stack.Screen name="RummyGame" component={RummyGameScreen} />
          <Stack.Screen name="MainApp" component={AppNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
      <ToastHost />
    </>
  );
};

const App = () => (
  <ThemeProvider>
    <Root />
  </ThemeProvider>
);

export default App;
