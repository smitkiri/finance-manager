function buildExpensesWhereClause(query) {
  const conditions = [];
  const params = [];
  let paramIndex = 1;

  if (query.dateFrom) {
    conditions.push(`date >= $${paramIndex}`);
    params.push(query.dateFrom);
    paramIndex++;
  }
  if (query.dateTo) {
    conditions.push(`date <= $${paramIndex}`);
    params.push(query.dateTo);
    paramIndex++;
  }
  if (query.userId) {
    conditions.push(`user_id = $${paramIndex}`);
    params.push(query.userId);
    paramIndex++;
  }
  if (query.categories && query.categories.length > 0) {
    conditions.push(`category = ANY($${paramIndex}::text[])`);
    params.push(Array.isArray(query.categories) ? query.categories : [query.categories]);
    paramIndex++;
  }
  if (query.types && query.types.length > 0) {
    conditions.push(`type = ANY($${paramIndex}::text[])`);
    params.push(Array.isArray(query.types) ? query.types : [query.types]);
    paramIndex++;
  }
  if (query.minAmount != null && query.minAmount !== '') {
    conditions.push(`amount >= $${paramIndex}`);
    params.push(parseFloat(query.minAmount));
    paramIndex++;
  }
  if (query.maxAmount != null && query.maxAmount !== '') {
    conditions.push(`amount <= $${paramIndex}`);
    params.push(parseFloat(query.maxAmount));
    paramIndex++;
  }
  if (query.search && query.search.trim()) {
    const searchTerm = `%${query.search.trim().toLowerCase()}%`;
    conditions.push(`(
      LOWER(description) LIKE $${paramIndex}
      OR LOWER(category) LIKE $${paramIndex}
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl
        WHERE LOWER(lbl) LIKE $${paramIndex}
      )
    )`);
    params.push(searchTerm);
    paramIndex++;
  }
  if (query.labels && query.labels.length > 0) {
    conditions.push(`EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl
      WHERE lbl = ANY($${paramIndex}::text[])
    )`);
    params.push(Array.isArray(query.labels) ? query.labels : [query.labels]);
    paramIndex++;
  }
  if (query.sources && query.sources.length > 0) {
    conditions.push(`metadata->>'sourceId' = ANY($${paramIndex}::text[])`);
    params.push(Array.isArray(query.sources) ? query.sources : [query.sources]);
    paramIndex++;
  }

  const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereSql, params };
}

function buildStatsWhereClause(dateFrom, dateTo, userId) {
  const conditions = [
    '($1::date IS NULL OR date >= $1)',
    '($2::date IS NULL OR date <= $2)',
    '($3::text IS NULL OR user_id = $3)',
    'excluded_from_calculations IS NOT TRUE',
    `(
      transfer_info IS NULL
      OR (transfer_info->>'isTransfer') IS DISTINCT FROM 'true'
      OR (
        (transfer_info->>'userOverride') IS NOT NULL AND (COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false)
        OR (transfer_info->>'transferType') = 'user' AND $3 IS NOT NULL
        OR (transfer_info->>'transferType') = 'self' AND (COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false)
        OR ((transfer_info->>'transferType') IS NULL OR (transfer_info->>'transferType') NOT IN ('user', 'self')) AND (COALESCE((transfer_info->>'excludedFromCalculations')::boolean, false) = false)
      )
    )`
  ];
  const params = [dateFrom || null, dateTo || null, userId || null];
  return { whereSql: 'WHERE ' + conditions.join(' AND '), params };
}

function rowToExpense(row) {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    category: row.category,
    amount: parseFloat(row.amount),
    type: row.type,
    user: row.user_id,
    labels: row.labels || [],
    metadata: row.metadata || {},
    transferInfo: row.transfer_info ? row.transfer_info : undefined,
    excludedFromCalculations: row.excluded_from_calculations || false,
    importId: row.import_id || null
  };
}

/**
 * Build the monthly aggregate SQL query for a single dashboard panel.
 * Extends buildStatsWhereClause with panel-specific filters.
 *
 * @param {object} opts
 * @param {string|null} opts.dateFrom  - YYYY-MM-DD
 * @param {string|null} opts.dateTo    - YYYY-MM-DD
 * @param {string|null} opts.userId
 * @param {string}      opts.filterType  - 'expense' | 'income' | 'both'
 * @param {string[]}    opts.filterCategories - [] means all
 * @param {string|null} opts.filterRegex - POSIX regex or null
 * @returns {{ sql: string, params: any[] }}
 */
function buildPanelDataQuery({ dateFrom, dateTo, userId, filterType, filterCategories, filterRegex }) {
  const { whereSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);
  // params already has $1, $2, $3 for dateFrom, dateTo, userId
  let nextParam = params.length + 1;
  let extraConditions = '';

  if (filterType !== 'both') {
    extraConditions += ` AND type = $${nextParam}`;
    params.push(filterType);
    nextParam++;
  }

  if (filterCategories && filterCategories.length > 0) {
    extraConditions += ` AND category = ANY($${nextParam}::text[])`;
    params.push(filterCategories);
    nextParam++;
  }

  if (filterRegex) {
    extraConditions += ` AND description ~* $${nextParam}`;
    params.push(filterRegex);
    nextParam++;
  }

  const sql = `
    SELECT
      TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS sort_month,
      TO_CHAR(date, 'Mon YYYY') AS month,
      type,
      SUM(amount) AS total
    FROM transactions
    ${whereSql}${extraConditions}
    GROUP BY sort_month, month, type
    ORDER BY sort_month ASC
  `;

  return { sql, params };
}

module.exports = { buildExpensesWhereClause, buildStatsWhereClause, rowToExpense, buildPanelDataQuery };
