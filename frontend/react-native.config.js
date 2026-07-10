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
    'react-native-sound': {
      platforms: {
        android: {
          sourceDir: '../node_modules/react-native-sound/android',
          packageImportPath: 'import com.zmxv.RNSound.SoundPackage;',
          packageInstance: 'new SoundPackage()',
        },
      },
    },
  },
};
