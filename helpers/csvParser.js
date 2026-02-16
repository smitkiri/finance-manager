const { findSimilarTransactionCategory } = require('./categoryMatcher');

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = parseCSVLine(lines[0]);

  return lines.slice(1)
    .filter((line) => {
      const values = parseCSVLine(line);
      const type = values[4] || '';
      return type !== 'Payment';
    })
    .map((line, index) => {
      const values = parseCSVLine(line);
      const amount = parseFloat(values[5] ? values[5].replace(/[,$"]/g, '') : '0') || 0;

      return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        date: values[0],
        description: values[2],
        category: values[3] || 'Uncategorized',
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
        metadata: {
          sourceName: 'Manual Import',
          importedAt: new Date().toISOString()
        }
      };
    });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result;
}

function mergeExpenses(existing, newExpenses) {
  const merged = [...existing];

  for (const newExpense of newExpenses) {
    const exists = merged.some(exp =>
      exp.date === newExpense.date &&
      exp.description === newExpense.description &&
      exp.amount === newExpense.amount &&
      exp.type === newExpense.type
    );

    if (!exists) {
      merged.push(newExpense);
    }
  }

  return merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function parseCSVWithMapping(csvText, mapping, userId, existingTransactions = []) {
  const lines = csvText.trim().split('\n');
  const headers = parseCSVLine(lines[0]);

  const columnIndexMap = new Map();
  mapping.mappings.forEach(m => {
    if (m.standardColumn !== 'Ignore') {
      const csvIndex = headers.findIndex(h => h === m.csvColumn);
      if (csvIndex !== -1) {
        columnIndexMap.set(csvIndex, m.standardColumn);
      }
    }
  });

  const autoFilledCategories = [];

  const expenses = lines.slice(1)
    .map((line, index) => {
      const values = parseCSVLine(line);

      let date = '';
      let description = '';
      let category = '';
      let amount = 0;

      columnIndexMap.forEach((standardCol, csvIndex) => {
        const value = values[csvIndex] || '';
        switch (standardCol) {
          case 'Transaction Date':
            date = value;
            break;
          case 'Description':
            description = value;
            break;
          case 'Category':
            category = value || 'Uncategorized';
            break;
          case 'Amount':
            amount = parseFloat(value.replace(/[,$\"]/g, '')) || 0;
            break;
        }
      });

      if ((!category || category === 'Uncategorized') && description && existingTransactions.length > 0) {
        const suggested = findSimilarTransactionCategory(description, existingTransactions, 100);
        if (suggested) {
          autoFilledCategories.push({
            row: index + 1,
            description,
            suggestedCategory: suggested
          });
          category = suggested;
        }
      }

      let transactionType = amount < 0 ? 'expense' : 'income';
      if (mapping.flipIncomeExpense) {
        transactionType = amount > 0 ? 'expense' : 'income';
      }

      return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        date,
        description,
        category,
        amount: Math.abs(amount),
        type: transactionType,
        metadata: {
          sourceId: mapping.id,
          sourceName: mapping.name,
          importedAt: new Date().toISOString()
        },
        user: userId
      };
    })
    .filter(expense => expense.date && expense.description && expense.amount > 0);

  return { expenses, autoFilledCategories };
}

module.exports = { parseCSV, parseCSVLine, parseCSVWithMapping, mergeExpenses };
