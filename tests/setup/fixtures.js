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
    `INSERT INTO transactions (id, date, description, category, amount, type, user_id, labels, metadata, transfer_info, excluded_from_calculations, import_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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
      txn.import_id || null,
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

/**
 * Insert a report directly into the test database.
 */
const insertReport = async (pool, overrides = {}) => {
  const rpt = makeReport(overrides);
  await pool.query(
    `INSERT INTO reports (id, name, description, filters)
     VALUES ($1, $2, $3, $4)`,
    [rpt.id, rpt.name, rpt.description, rpt.filters]
  );
  return rpt;
};

/**
 * Insert a dashboard directly into the test database.
 */
const insertDashboard = async (pool, overrides = {}) => {
  const dash = makeDashboard(overrides);
  await pool.query(
    `INSERT INTO dashboards (id, name, is_default, date_range_start, date_range_end)
     VALUES ($1, $2, $3, $4, $5)`,
    [dash.id, dash.name, dash.is_default, dash.date_range_start, dash.date_range_end]
  );
  return dash;
};

/**
 * Insert a dashboard panel directly into the test database.
 */
const insertDashboardPanel = async (pool, dashboardId, overrides = {}) => {
  const panel = makeDashboardPanel(dashboardId, overrides);
  await pool.query(
    `INSERT INTO dashboard_panels (id, dashboard_id, title, chart_type, filter_groups, series_mode, net_orientation, panel_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      panel.id,
      panel.dashboard_id,
      panel.title,
      panel.chart_type,
      panel.filter_groups,
      panel.series_mode,
      panel.net_orientation,
      panel.panel_order,
    ]
  );
  return panel;
};

/**
 * Insert an account directly into the test database.
 */
const insertAccount = async (pool, overrides = {}) => {
  const acct = makeAccount(overrides);
  await pool.query('INSERT INTO accounts (id, user_id, name, type) VALUES ($1, $2, $3, $4)', [
    acct.id,
    acct.user_id,
    acct.name,
    acct.type,
  ]);
  return acct;
};

/**
 * Insert an account balance directly into the test database.
 */
const insertAccountBalance = async (pool, accountId, overrides = {}) => {
  const bal = makeAccountBalance(accountId, overrides);
  await pool.query(
    'INSERT INTO account_balances (id, account_id, balance, date, note) VALUES ($1, $2, $3, $4, $5)',
    [bal.id, bal.account_id, bal.balance, bal.date, bal.note]
  );
  return bal;
};

/**
 * Insert an import session directly into the test database.
 */
const insertImportSession = async (pool, overrides = {}) => {
  const session = {
    id: uniqueId('session'),
    user_id: 'user-1',
    source_id: null,
    source_name: 'Test Source',
    file_name: 'test.csv',
    transaction_count: 0,
    ...overrides,
  };
  await pool.query(
    `INSERT INTO import_sessions (id, user_id, source_id, source_name, file_name, transaction_count)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      session.id,
      session.user_id,
      session.source_id,
      session.source_name,
      session.file_name,
      session.transaction_count,
    ]
  );
  return session;
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
  insertReport,
  insertDashboard,
  insertDashboardPanel,
  insertAccount,
  insertAccountBalance,
  insertImportSession,
};
