/* eslint-disable no-console */
const { teardownTestDb, closeTestDb } = require('./testDb');

module.exports = async () => {
  console.log('\nTearing down test database...');
  await teardownTestDb();
  await closeTestDb();
  console.log('Test database cleaned up.\n');
};
