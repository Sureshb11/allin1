import React, {useState, useEffect} from 'react';
import {StatusBar} from 'react-native';
import 'react-native-gesture-handler';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';
import SportPickerScreen from './src/screens/SportPickerScreen';
import SportSetupScreen from './src/screens/SportSetupScreen';
import RummyHomeScreen from './src/sports/rummy/screens/RummyHomeScreen';
import RummyNewGameScreen from './src/sports/rummy/screens/RummyNewGameScreen';
import RummyGameScreen from './src/sports/rummy/screens/RummyGameScreen';
import SplashScreen from './src/components/SplashScreen';
import { ToastHost } from './src/components/Toast';
import legendsApi from './src/services/LegendsApi';

const Stack = createStackNavigator();

// ⚙️ DEV ONLY — bypass the login/OTP screens and start straight on the sport
// picker so you can develop & test the in-app flows without signing in.
// Set this back to `false` to re-enable the OTP auth screen before release.
const DEV_BYPASS_LOGIN = false;

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  // Restore a saved session on launch so reopening the app doesn't re-prompt OTP.
  useEffect(() => {
    legendsApi.loadToken().then((token) => {
      setIsAuthenticated(!!token);
      setReady(true);
    });
  }, []);

  if (!ready) {
    // branded splash while we read the persisted token
    return <SplashScreen />;
  }

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor="#000"
      />
      <NavigationContainer>
        <Stack.Navigator
          id="RootStack"
          screenOptions={{ headerShown: false, animationEnabled: false, cardStyle: { backgroundColor: '#0f131f' } }}
          initialRouteName={(DEV_BYPASS_LOGIN || isAuthenticated) ? 'SportPicker' : 'Auth'}
        >
          <Stack.Screen name="Auth" component={AuthNavigator} />
          {/* SportPicker shown on every launch after auth */}
          <Stack.Screen name="SportPicker" component={SportPickerScreen} />
          <Stack.Screen name="SportSetup" component={SportSetupScreen} />
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

export default App;
