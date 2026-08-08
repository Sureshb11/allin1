import React from 'react';
import {createStackNavigator} from '@react-navigation/stack';

import LoginScreen from '../screens/LoginScreen';
import SignUpScreen from '../screens/SignUpScreen';
import MobileVerificationScreen from '../screens/MobileVerificationScreen';
import { useTheme } from '../theme/ThemeContext';

const Stack = createStackNavigator();

const AuthNavigator = () => {
  const { colors } = useTheme();
  return (
    <Stack.Navigator 
      screenOptions={{ 
        headerShown: false,
        cardStyle: { backgroundColor: colors.bg }
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="SignUp" component={SignUpScreen} />
      <Stack.Screen name="MobileVerification" component={MobileVerificationScreen} />
    </Stack.Navigator>
  );
};

export default AuthNavigator;
