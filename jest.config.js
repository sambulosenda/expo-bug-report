module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__tests__/__mocks__/react-native.ts',
    '^react-native-svg$': '<rootDir>/src/__tests__/__mocks__/react-native-svg.ts',
    '^react-native-gesture-handler$': '<rootDir>/src/__tests__/__mocks__/react-native-gesture-handler.ts',
    '^react-native-view-shot$': '<rootDir>/src/__tests__/__mocks__/react-native-view-shot.ts',
    '^expo-sensors$': '<rootDir>/src/__tests__/__mocks__/expo-sensors.ts',
    '^expo-device$': '<rootDir>/src/__tests__/__mocks__/expo-device.ts',
    '^expo-constants$': '<rootDir>/src/__tests__/__mocks__/expo-constants.ts',
    '^expo-clipboard$': '<rootDir>/src/__tests__/__mocks__/expo-clipboard.ts',
    '^expo-localization$': '<rootDir>/src/__tests__/__mocks__/expo-localization.ts',
    '^expo-file-system/legacy$': '<rootDir>/src/__tests__/__mocks__/expo-file-system-legacy.ts',
  },
};
