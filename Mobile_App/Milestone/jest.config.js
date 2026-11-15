module.exports = {
  preset: '@react-native/jest-preset',
  moduleNameMapper: {
    '^lucide-react-native/icons/(.*)$': '<rootDir>/node_modules/lucide-react-native/dist/cjs/icons/$1.js',
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-secure-store.js',
    '^expo-file-system$': '<rootDir>/__mocks__/expo-file-system.js',
    '^expo-image-picker$': '<rootDir>/__mocks__/expo-image-picker.js',
    '^@expo-google-fonts/montserrat/.*$': '<rootDir>/__mocks__/montserrat.js',
    '^react-native-url-polyfill/auto$': '<rootDir>/__mocks__/empty.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
  },
  transform: {
    '^.+\\.(ttf|mp3)$': require.resolve('@react-native/jest-preset/jest/assetFileTransformer.js'),
  },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-safe-area-context|react-native-svg|expo(?:-[^/]+)?|@expo(?:/[^/]+)?)/)',
  ],
  testPathIgnorePatterns: ['<rootDir>/.expo/'],
};
