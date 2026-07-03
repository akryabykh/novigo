/** @type {import('jest').Config} */
// Pure-logic unit tests run on plain Node with a minimal TS transform — no
// jest-expo / react-native runtime needed (nothing under test imports RN at
// runtime). Component behaviour that would need the RN renderer is factored into
// pure helpers (e.g. task-row-logic) and tested directly.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }]],
      },
    ],
  },
};
