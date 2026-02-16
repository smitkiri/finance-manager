const express = require('express');
const fs = require('fs');
const router = express.Router();
const db = require('../database');
const { parseCSV, parseCSVWithMapping, mergeExpenses } = require('../helpers/csvParser');
const { detectTransfers } = require('../helpers/transferDetection');
const { getFilePath, ensureArtifactsDir } = require('../helpers/fileUtils');

router.post('/import-csv', async (req, res) => {
  try {
    const { csvText } = req.body;

    const expenses = parseCSV(csvText);

    const existingResult = await db.query('SELECT * FROM transactions');
    const existingExpenses = existingResult.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type,
      user: row.user_id,
      labels: row.labels || [],
      metadata: row.metadata || {},
      transferInfo: row.transfer_info,
      excludedFromCalculations: row.excluded_from_calculations
    }));

    const mergedExpenses = mergeExpenses(existingExpenses, expenses);

    const { transfers, updatedTransactions } = detectTransfers(mergedExpenses);

    const client = await db.beginTransaction();
    try {
      await client.query('DELETE FROM transactions');

      for (const expense of updatedTransactions) {
        await client.query(
          `INSERT INTO transactions (
            id, date, description, category, amount, type, user_id,
            labels, metadata, transfer_info, excluded_from_calculations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            expense.id,
            expense.date,
            expense.description,
            expense.category || 'Uncategorized',
            expense.amount,
            expense.type,
            expense.user,
            JSON.stringify(expense.labels || []),
            JSON.stringify(expense.metadata || {}),
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false
          ]
        );
      }

      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }

    res.json({
      success: true,
      imported: expenses.length,
      total: updatedTransactions.length,
      transfersDetected: transfers.length
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

router.get('/export-csv', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM transactions ORDER BY date DESC');

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No expenses found' });
    }

    const expenses = result.rows.map(row => ({
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type
    }));

    const headers = ['Date', 'Description', 'Category', 'Amount', 'Type'];
    const csvContent = [
      headers.join(','),
      ...expenses.map(exp => [
        exp.date,
        `"${exp.description}"`,
        `"${exp.category}"`,
        exp.amount.toString(),
        exp.type
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

router.get('/column-mappings', (req, res) => {
  try {
    const mappingsFile = getFilePath('mappings.json');
    if (!fs.existsSync(mappingsFile)) {
      return res.json([]);
    }

    const data = fs.readFileSync(mappingsFile, 'utf8');
    const mappings = JSON.parse(data);
    res.json(mappings);
  } catch (error) {
    console.error('Error reading column mappings:', error);
    res.status(500).json({ error: 'Failed to read column mappings' });
  }
});

router.post('/column-mappings', (req, res) => {
  try {
    const { mapping } = req.body;

    let mappings = [];
    const mappingsFile = getFilePath('mappings.json');
    if (fs.existsSync(mappingsFile)) {
      const data = fs.readFileSync(mappingsFile, 'utf8');
      mappings = JSON.parse(data);
    }

    mappings.push(mapping);

    ensureArtifactsDir();
    fs.writeFileSync(mappingsFile, JSON.stringify(mappings, null, 2));

    res.json({ success: true, count: mappings.length });
  } catch (error) {
    console.error('Error saving column mapping:', error);
    res.status(500).json({ error: 'Failed to save column mapping' });
  }
});

router.post('/import-with-mapping', async (req, res) => {
  try {
    const { csvText, mapping, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const existingResult = await db.query('SELECT * FROM transactions');
    const existingExpenses = existingResult.rows.map(row => ({
      id: row.id,
      date: row.date,
      description: row.description,
      category: row.category,
      amount: parseFloat(row.amount),
      type: row.type,
      user: row.user_id,
      labels: row.labels || [],
      metadata: row.metadata || {},
      transferInfo: row.transfer_info,
      excludedFromCalculations: row.excluded_from_calculations
    }));

    const { expenses, autoFilledCategories } = parseCSVWithMapping(csvText, mapping, userId, existingExpenses);

    const mergedExpenses = mergeExpenses(existingExpenses, expenses);

    const { transfers, updatedTransactions } = detectTransfers(mergedExpenses);

    const client = await db.beginTransaction();
    try {
      await client.query('DELETE FROM transactions');

      for (const expense of updatedTransactions) {
        await client.query(
          `INSERT INTO transactions (
            id, date, description, category, amount, type, user_id,
            labels, metadata, transfer_info, excluded_from_calculations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            expense.id,
            expense.date,
            expense.description,
            expense.category || 'Uncategorized',
            expense.amount,
            expense.type,
            expense.user,
            JSON.stringify(expense.labels || []),
            JSON.stringify(expense.metadata || {}),
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false
          ]
        );
      }

      await db.commitTransaction(client);
    } catch (error) {
      await db.rollbackTransaction(client);
      throw error;
    }

    res.json({
      success: true,
      imported: expenses.length,
      total: updatedTransactions.length,
      transfersDetected: transfers.length,
      autoFilledCategories
    });
  } catch (error) {
    console.error('Error importing CSV with mapping:', error);
    res.status(500).json({ error: 'Failed to import CSV with mapping' });
  }
});

module.exports = router;
