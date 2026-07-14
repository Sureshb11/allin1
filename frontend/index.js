/**
 * @format
 */

import {AppRegistry, Text, TextInput, Platform} from 'react-native';
// Global font → Inter is applied directly in RN's patched Text.js / TextInput.js
// (see patches/react-native+0.75.2.patch). A JS render-wrapper can't do it because
// RN's Text wraps its output in a Context Provider, so wrapper styles never reach
// the native text node.
import App from './App';

// Lock text to the designed sizes so the OS "Font size" accessibility setting can't
// scale labels until they clip/overflow on Large/Medium displays. (Keeps the UI as-is.)
Text.defaultProps = Text.defaultProps || {};
Text.defaultProps.allowFontScaling = false;

TextInput.defaultProps = TextInput.defaultProps || {};
TextInput.defaultProps.allowFontScaling = false;

AppRegistry.registerComponent('LocalLegends', () => App);
