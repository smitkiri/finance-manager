function detectTransfers(transactions) {
  const transfers = [];
  const updatedTransactions = [...transactions];
  const processedIds = new Set();

  const transactionsBySource = new Map();

  transactions.forEach(transaction => {
    const sourceId = transaction.metadata?.sourceId || 'manual';
    if (!transactionsBySource.has(sourceId)) {
      transactionsBySource.set(sourceId, []);
    }
    transactionsBySource.get(sourceId).push(transaction);
  });

  const sourceIds = Array.from(transactionsBySource.keys());

  // Look for transfers between different sources
  for (let i = 0; i < sourceIds.length; i++) {
    for (let j = i + 1; j < sourceIds.length; j++) {
      const source1 = sourceIds[i];
      const source2 = sourceIds[j];

      const source1Transactions = transactionsBySource.get(source1);
      const source2Transactions = transactionsBySource.get(source2);

      for (const t1 of source1Transactions) {
        if (processedIds.has(t1.id)) continue;

        for (const t2 of source2Transactions) {
          if (processedIds.has(t2.id)) continue;

          if (isTransferPair(t1, t2)) {
            const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const confidence = calculateTransferConfidence(t1, t2);

            transfers.push({
              credit: t1.type === 'income' ? t1 : t2,
              debit: t1.type === 'expense' ? t1 : t2,
              transferId,
              confidence
            });

            processedIds.add(t1.id);
            processedIds.add(t2.id);
            break;
          }
        }
      }
    }
  }

  // Look for transfers within the same source but between different users
  for (const sourceId of sourceIds) {
    const sourceTransactions = transactionsBySource.get(sourceId);

    const transactionsByUser = new Map();
    sourceTransactions.forEach(transaction => {
      const userId = transaction.user;
      if (!transactionsByUser.has(userId)) {
        transactionsByUser.set(userId, []);
      }
      transactionsByUser.get(userId).push(transaction);
    });

    const userIds = Array.from(transactionsByUser.keys());

    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const user1 = userIds[i];
        const user2 = userIds[j];

        const user1Transactions = transactionsByUser.get(user1);
        const user2Transactions = transactionsByUser.get(user2);

        for (const t1 of user1Transactions) {
          if (processedIds.has(t1.id)) continue;

          for (const t2 of user2Transactions) {
            if (processedIds.has(t2.id)) continue;

            if (isTransferPair(t1, t2)) {
              const transferId = `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const confidence = calculateTransferConfidence(t1, t2);

              transfers.push({
                credit: t1.type === 'income' ? t1 : t2,
                debit: t1.type === 'expense' ? t1 : t2,
                transferId,
                confidence
              });

              processedIds.add(t1.id);
              processedIds.add(t2.id);
              break;
            }
          }
        }
      }
    }
  }

  // Update transactions with transfer info
  transfers.forEach(transfer => {
    const creditIndex = updatedTransactions.findIndex(t => t.id === transfer.credit.id);
    const debitIndex = updatedTransactions.findIndex(t => t.id === transfer.debit.id);

    const transferType = transfer.credit.user === transfer.debit.user ? 'self' : 'user';

    if (creditIndex !== -1) {
      updatedTransactions[creditIndex] = {
        ...updatedTransactions[creditIndex],
        transferInfo: {
          isTransfer: true,
          transferId: transfer.transferId,
          transferType,
          excludedFromCalculations: true,
          userOverride: false
        }
      };
    }

    if (debitIndex !== -1) {
      updatedTransactions[debitIndex] = {
        ...updatedTransactions[debitIndex],
        transferInfo: {
          isTransfer: true,
          transferId: transfer.transferId,
          transferType,
          excludedFromCalculations: true,
          userOverride: false
        }
      };
    }
  });

  return { transfers, updatedTransactions };
}

function isTransferPair(t1, t2) {
  const source1 = t1.metadata?.sourceId || 'manual';
  const source2 = t2.metadata?.sourceId || 'manual';
  const user1 = t1.user;
  const user2 = t2.user;

  if (source1 === source2 && user1 === user2) return false;
  if (t1.type === t2.type) return false;
  if (Math.abs(t1.amount) !== Math.abs(t2.amount)) return false;

  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 4) return false;

  return true;
}

function calculateTransferConfidence(t1, t2) {
  let confidence = 0.5;

  if (Math.abs(t1.amount) === Math.abs(t2.amount)) {
    confidence += 0.4;
  } else {
    return 0;
  }

  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff === 0) confidence += 0.2;
  else if (daysDiff <= 1) confidence += 0.15;
  else if (daysDiff <= 2) confidence += 0.1;
  else if (daysDiff <= 3) confidence += 0.05;

  const desc1 = t1.description.toLowerCase();
  const desc2 = t2.description.toLowerCase();
  if (desc1.includes('transfer') || desc2.includes('transfer')) confidence += 0.1;
  if (desc1.includes('move') || desc2.includes('move')) confidence += 0.05;

  return Math.min(confidence, 1);
}

module.exports = { detectTransfers, isTransferPair, calculateTransferConfidence };
