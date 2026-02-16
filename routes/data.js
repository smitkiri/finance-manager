const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('../database');
const { getArtifactsDir, getFilePath, ensureArtifactsDir } = require('../helpers/fileUtils');

router.delete('/delete-all', async (req, res) => {
  try {
    await db.query('DELETE FROM transactions');
    await db.query('DELETE FROM sources');
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({ error: 'Failed to delete all data' });
  }
});

router.post('/delete-selected', async (req, res) => {
  try {
    const { deleteTransactions, deleteSources, sourceIds } = req.body;

    if (deleteTransactions) {
      await db.query('DELETE FROM transactions');
    }

    if (deleteSources && Array.isArray(sourceIds) && sourceIds.length > 0) {
      await db.query('DELETE FROM sources WHERE id = ANY($1)', [sourceIds]);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting selected data:', error);
    res.status(500).json({ error: 'Failed to delete selected data' });
  }
});

router.post('/undo-import', (req, res) => {
  try {
    const { importSessionId, importedAt, sourceName } = req.body;

    let existingExpenses = [];
    const transactionsFile = getFilePath('transactions.json');
    if (fs.existsSync(transactionsFile)) {
      const data = fs.readFileSync(transactionsFile, 'utf8');
      existingExpenses = JSON.parse(data);
    }

    const transactionsToRemove = existingExpenses.filter(transaction => {
      const metadata = transaction.metadata;
      return metadata &&
             metadata.sourceName === sourceName &&
             metadata.importedAt === importedAt;
    });

    const transactionsToKeep = existingExpenses.filter(transaction => {
      const metadata = transaction.metadata;
      return !metadata ||
             metadata.sourceName !== sourceName ||
             metadata.importedAt !== importedAt;
    });

    if (transactionsToRemove.length === 0) {
      return res.status(404).json({ error: 'No transactions found to undo' });
    }

    const backupFile = path.join(getArtifactsDir(), `transactions_backup_${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(existingExpenses, null, 2));

    ensureArtifactsDir();
    fs.writeFileSync(transactionsFile, JSON.stringify(transactionsToKeep, null, 2));

    res.json({
      success: true,
      removed: transactionsToRemove.length,
      total: transactionsToKeep.length,
      backupFile: path.basename(backupFile)
    });
  } catch (error) {
    console.error('Error undoing import:', error);
    res.status(500).json({ error: 'Failed to undo import' });
  }
});

module.exports = router;
