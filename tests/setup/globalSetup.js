/* eslint-disable no-console */
const { setupTestDb } = require('./testDb');

module.exports = async () => {
  console.log('\nSetting up test database...');
  await setupTestDb();
  console.log('Test database ready.\n');
};
