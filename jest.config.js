/** @type {import('jest').Config} */
// Unit tests and React component/hook contracts run on Node. Component suites
// mock native hosts/animation drivers; browser and device checks remain separate.
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.expo/'],
  transform: {
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      {
        configFile: false,
        babelrc: false,
        presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
      },
    ],
  },
};
