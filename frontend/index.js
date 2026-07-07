/**
 * @format
 */

import {AppRegistry, Text, TextInput, Platform} from 'react-native';
import './src/utils/applyLexendFont'; // global font → Google Lexend (weight-mapped)
import App from './App';

// Lock text to the designed sizes so the OS "Font size" accessibility setting can't
// scale labels until they clip/overflow on Large/Medium displays. (Keeps the UI as-is.)
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.allowFontScaling = false;
Text.defaultProps.style = [{ fontFamily: Platform.OS === 'android' ? 'lexend' : 'Lexend' }, Text.defaultProps.style];

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.allowFontScaling = false;
TextInput.defaultProps.style = [{ fontFamily: Platform.OS === 'android' ? 'lexend' : 'Lexend' }, TextInput.defaultProps.style];

AppRegistry.registerComponent('LocalLegends', () => App);
