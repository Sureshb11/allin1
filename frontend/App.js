import React, {useState, useEffect} from 'react';
import {StatusBar} from 'react-native';
import 'react-native-gesture-handler';
import {NavigationContainer} from '@react-navigation/native';
import {createStackNavigator} from '@react-navigation/stack';
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';
import SportPickerScreen from './src/screens/SportPickerScreen';
import SportSetupScreen from './src/screens/SportSetupScreen';

const Stack = createStackNavigator();

// ⚙️ DEV ONLY — bypass the login/OTP screens and start straight on the sport
// picker so you can develop & test the in-app flows without signing in.
// Set this back to `false` to re-enable the OTP auth screen before release.
const DEV_BYPASS_LOGIN = false;

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

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
          <Stack.Screen name="MainApp" component={AppNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </>
  );
};

export default App;
