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
    )`,
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
    importId: row.import_id || null,
  };
}

/**
 * Build a WHERE clause fragment from filter_groups JSONB.
 * Groups are OR'd; conditions within a group are AND'd.
 * Appends to an existing parameterized query.
 *
 * @param {Array} filterGroups - parsed filter_groups JSONB
 * @param {any[]} params - existing params array (mutated in place)
 * @param {number} startParam - next $N index
 * @returns {{ sql: string, nextParam: number }} - SQL fragment (without leading AND/OR) and updated param index
 */
function buildFilterGroupsWhereClause(filterGroups, params, startParam) {
  if (!filterGroups || filterGroups.length === 0) {
    return { sql: '', nextParam: startParam };
  }

  let nextParam = startParam;
  const groupSqls = [];

  for (const group of filterGroups) {
    if (!group.conditions || group.conditions.length === 0) continue;

    const condSqls = [];
    for (const cond of group.conditions) {
      switch (cond.field) {
        case 'type':
          if (cond.operator === 'is' && cond.value) {
            condSqls.push(`type = $${nextParam}`);
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'category':
          if (Array.isArray(cond.value) && cond.value.length > 0) {
            if (cond.operator === 'is') {
              condSqls.push(`category = ANY($${nextParam}::text[])`);
            } else {
              condSqls.push(`category != ALL($${nextParam}::text[])`);
            }
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'labels':
          if (Array.isArray(cond.value) && cond.value.length > 0) {
            const exists = cond.operator === 'excludes' ? 'NOT EXISTS' : 'EXISTS';
            condSqls.push(`${exists} (
              SELECT 1 FROM jsonb_array_elements_text(COALESCE(labels, '[]'::jsonb)) AS lbl
              WHERE lbl = ANY($${nextParam}::text[])
            )`);
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'description':
          if (cond.operator === 'matches' && cond.value) {
            condSqls.push(`description ~* $${nextParam}`);
            params.push(cond.value);
            nextParam++;
          }
          break;
        case 'amount':
          if (cond.value != null && cond.value !== '') {
            if (cond.operator === 'gte') {
              condSqls.push(`amount >= $${nextParam}`);
            } else {
              condSqls.push(`amount <= $${nextParam}`);
            }
            params.push(parseFloat(cond.value));
            nextParam++;
          }
          break;
      }
    }

    if (condSqls.length > 0) {
      groupSqls.push(`(${condSqls.join(' AND ')})`);
    }
  }

  if (groupSqls.length === 0) {
    return { sql: '', nextParam };
  }

  const sql = groupSqls.length === 1 ? groupSqls[0] : `(${groupSqls.join(' OR ')})`;

  return { sql, nextParam };
}

/**
 * Build the monthly aggregate SQL query for a single dashboard panel.
 * Extends buildStatsWhereClause with filter groups.
 */
function buildPanelDataQuery({ dateFrom, dateTo, userId, filterGroups }) {
  const { whereSql, params } = buildStatsWhereClause(dateFrom, dateTo, userId);
  let nextParam = params.length + 1;

  const { sql: filterSql, nextParam: updatedParam } = buildFilterGroupsWhereClause(
    filterGroups,
    params,
    nextParam
  );
  nextParam = updatedParam;

  const extraConditions = filterSql ? ` AND ${filterSql}` : '';

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

/**
 * Build a month map pre-populated with every month in [dateFrom, dateTo].
 * Keys are "YYYY-MM", values are { month: "Mon YYYY" }.
 */
function buildMonthSeries(dateFrom, dateTo) {
  const monthMap = {};
  const cur = new Date(dateFrom + 'T00:00:00');
  const end = new Date(dateTo + 'T00:00:00');
  cur.setDate(1);
  end.setDate(1);
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  while (cur <= end) {
    const key = cur.toISOString().slice(0, 7);
    monthMap[key] = { month: `${monthNames[cur.getMonth()]} ${cur.getFullYear()}` };
    cur.setMonth(cur.getMonth() + 1);
  }
  return monthMap;
}

module.exports = {
  buildExpensesWhereClause,
  buildStatsWhereClause,
  rowToExpense,
  buildPanelDataQuery,
  buildFilterGroupsWhereClause,
  buildMonthSeries,
};
