module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // react-native-reanimated/plugin MUST be listed last — it rewrites worklets and
  // relies on every other transform having already run.
  plugins: ['react-native-reanimated/plugin'],
};
