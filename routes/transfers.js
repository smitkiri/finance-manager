const express = require('express');
const fs = require('fs');
const router = express.Router();
const db = require('../database');
const { detectTransfers } = require('../helpers/transferDetection');
const { getFilePath, ensureArtifactsDir } = require('../helpers/fileUtils');

router.post('/transfer-override', async (req, res) => {
  try {
    const { transactionId, includeInCalculations } = req.body;

    const transactionResult = await db.query('SELECT * FROM transactions WHERE id = $1', [transactionId]);
    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = transactionResult.rows[0];
    const transferInfo = transaction.transfer_info;

    if (!transferInfo || !transferInfo.isTransfer) {
      return res.status(400).json({ error: 'Transaction is not a transfer' });
    }

    const updatedTransferInfo = {
      ...transferInfo,
      excludedFromCalculations: !includeInCalculations,
      userOverride: true
    };

    await db.query(
      'UPDATE transactions SET transfer_info = $1 WHERE id = $2',
      [JSON.stringify(updatedTransferInfo), transactionId]
    );

    if (transferInfo.transferId) {
      const transferId = transferInfo.transferId;
      await db.query(
        `UPDATE transactions SET transfer_info = $1
         WHERE transfer_info->>'transferId' = $2 AND id != $3`,
        [JSON.stringify(updatedTransferInfo), transferId, transactionId]
      );
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer override:', error);
    res.status(500).json({ error: 'Failed to update transfer override' });
  }
});

router.post('/detect-transfers', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM transactions');
    const transactions = result.rows.map(row => ({
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

    if (transactions.length === 0) {
      return res.status(404).json({ error: 'No transactions found' });
    }

    const { transfers, updatedTransactions } = detectTransfers(transactions);

    const client = await db.beginTransaction();
    try {
      for (const expense of updatedTransactions) {
        await client.query(
          `UPDATE transactions SET
             transfer_info = $1,
             excluded_from_calculations = $2
           WHERE id = $3`,
          [
            expense.transferInfo ? JSON.stringify(expense.transferInfo) : null,
            expense.excludedFromCalculations || false,
            expense.id
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
      transfersDetected: transfers.length,
      totalTransactions: updatedTransactions.length
    });
  } catch (error) {
    console.error('Error detecting transfers:', error);
    res.status(500).json({ error: 'Failed to detect transfers' });
  }
});

router.post('/rerun-transfer-detection', (req, res) => {
  try {
    const transactionsFile = getFilePath('transactions.json');
    if (!fs.existsSync(transactionsFile)) {
      return res.status(404).json({ error: 'No transactions found' });
    }

    const data = fs.readFileSync(transactionsFile, 'utf8');
    const transactions = JSON.parse(data);

    const cleanedTransactions = transactions.map(transaction => {
      const { transferInfo, ...rest } = transaction;
      return rest;
    });

    const { transfers, updatedTransactions } = detectTransfers(cleanedTransactions);

    ensureArtifactsDir();
    fs.writeFileSync(transactionsFile, JSON.stringify(updatedTransactions, null, 2));

    res.json({
      success: true,
      totalTransactions: updatedTransactions.length,
      transfersDetected: transfers.length,
      message: 'Transfer detection completed successfully'
    });
  } catch (error) {
    console.error('Error re-running transfer detection:', error);
    res.status(500).json({ error: 'Failed to re-run transfer detection' });
  }
});

module.exports = router;
