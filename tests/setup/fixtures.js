let counter = 0;

const uniqueId = (prefix = 'test') => `${prefix}-${Date.now()}-${++counter}`;

/**
 * Factory: create a valid transaction object.
 */
const makeTransaction = (overrides = {}) => ({
  id: uniqueId('txn'),
  date: '2024-06-15',
  description: 'Test transaction',
  category: 'Food',
  amount: 25.0,
  type: 'expense',
  user_id: 'user-1',
  labels: JSON.stringify([]),
  metadata: JSON.stringify({}),
  transfer_info: null,
  excluded_from_calculations: false,
  ...overrides,
});

/**
 * Factory: create a valid user object.
 */
const makeUser = (overrides = {}) => ({
  id: uniqueId('user'),
  name: 'Test User',
  ...overrides,
});

/**
 * Factory: create a valid category name.
 */
const makeCategory = (name) => name || `Category-${++counter}`;

/**
 * Factory: create a valid source object.
 */
const makeSource = (overrides = {}) => ({
  id: uniqueId('src'),
  name: `Test Source ${counter}`,
  mappings: JSON.stringify([]),
  flip_income_expense: false,
  ...overrides,
});

/**
 * Factory: create a valid report object.
 */
const makeReport = (overrides = {}) => ({
  id: uniqueId('rpt'),
  name: 'Test Report',
  description: 'A test report',
  filters: JSON.stringify({}),
  ...overrides,
});

/**
 * Factory: create a valid dashboard object.
 */
const makeDashboard = (overrides = {}) => ({
  id: uniqueId('dash'),
  name: 'Test Dashboard',
  is_default: false,
  date_range_start: '2024-01-01',
  date_range_end: '2024-12-31',
  ...overrides,
});

/**
 * Factory: create a valid dashboard panel object.
 */
const makeDashboardPanel = (dashboardId, overrides = {}) => ({
  id: uniqueId('panel'),
  dashboard_id: dashboardId,
  title: 'Test Panel',
  chart_type: 'bar',
  filter_type: 'both',
  filter_categories: JSON.stringify([]),
  filter_groups: JSON.stringify([]),
  series_mode: 'two_series',
  net_orientation: null,
  panel_order: 0,
  ...overrides,
});

/**
 * Factory: create a valid account object (net worth).
 */
const makeAccount = (overrides = {}) => ({
  id: uniqueId('acct'),
  user_id: 'user-1',
  name: 'Test Account',
  type: 'asset',
  ...overrides,
});

/**
 * Factory: create a valid account balance snapshot.
 */
const makeAccountBalance = (accountId, overrides = {}) => ({
  id: uniqueId('bal'),
  account_id: accountId,
  balance: 1000.0,
  date: '2024-06-15',
  note: null,
  ...overrides,
});

/**
 * Insert a transaction directly into the test database.
 */
const insertTransaction = async (pool, overrides = {}) => {
  const txn = makeTransaction(overrides);
  await pool.query(
    `INSERT INTO transactions (id, date, description, category, amount, type, user_id, labels, metadata, transfer_info, excluded_from_calculations)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      txn.id,
      txn.date,
      txn.description,
      txn.category,
      txn.amount,
      txn.type,
      txn.user_id,
      txn.labels,
      txn.metadata,
      txn.transfer_info,
      txn.excluded_from_calculations,
    ]
  );
  return txn;
};

/**
 * Insert a user directly into the test database.
 */
const insertUser = async (pool, overrides = {}) => {
  const user = makeUser(overrides);
  await pool.query('INSERT INTO users (id, name) VALUES ($1, $2)', [user.id, user.name]);
  return user;
};

/**
 * Insert a category directly into the test database.
 */
const insertCategory = async (pool, name) => {
  const cat = makeCategory(name);
  await pool.query('INSERT INTO categories (name) VALUES ($1) ON CONFLICT DO NOTHING', [cat]);
  return cat;
};

/**
 * Insert a source directly into the test database.
 */
const insertSource = async (pool, overrides = {}) => {
  const src = makeSource(overrides);
  await pool.query(
    'INSERT INTO sources (id, name, mappings, flip_income_expense) VALUES ($1, $2, $3, $4)',
    [src.id, src.name, src.mappings, src.flip_income_expense]
  );
  return src;
};

module.exports = {
  uniqueId,
  makeTransaction,
  makeUser,
  makeCategory,
  makeSource,
  makeReport,
  makeDashboard,
  makeDashboardPanel,
  makeAccount,
  makeAccountBalance,
  insertTransaction,
  insertUser,
  insertCategory,
  insertSource,
};
