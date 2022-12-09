/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ["./jest.setup.js"],
  transformIgnorePatterns: ["node_modules/(?!@guardian/private-infrastructure-config)"]
};
