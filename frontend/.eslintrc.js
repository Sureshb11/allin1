// `npm run lint` has been in package.json since the project was created, and
// @react-native/eslint-config has been in devDependencies the whole time — but
// this file was never written, so the script only ever printed "ESLint couldn't
// find a configuration file". Nothing was linted, ever.
//
// That cost real bugs. A refactor deleted two functions this screen renders and
// the file still parsed, because a call to a missing function is just an
// identifier; `no-undef` catches it instantly and nothing was running it.
//
//   npm run lint            # whole project
//   npx eslint src/screens/LookingForScreen.js
module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // The screens carry deliberate, commented dependency choices — refs that
    // must not rebuild callbacks, effects that must not re-run on every
    // keystroke. Warn so they're visible without failing the run.
    'react-hooks/exhaustive-deps': 'warn',
    // The one that matters most here: a reference to something that doesn't
    // exist is always a crash, never a style opinion.
    'no-undef': 'error',
    // Formatting is not what this is for.
    'prettier/prettier': 'off',
    'react-native/no-inline-styles': 'off',
  },
  ignorePatterns: [
    'node_modules/',
    'android/',
    'ios/',
    'vendor/',
    '**/*.bundle',
  ],
};
