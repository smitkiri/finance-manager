const fs = require('fs');
const path = require('path');

// Import the transfer detection logic from server.js
function detectTransfers(transactions) {
  const transfers = [];
  const updatedTransactions = [...transactions];
  const processedIds = new Set();

  // Group transactions by source
  const transactionsBySource = new Map();
  
  transactions.forEach(transaction => {
    const sourceId = transaction.metadata?.sourceId || 'manual';
    if (!transactionsBySource.has(sourceId)) {
      transactionsBySource.set(sourceId, []);
    }
    transactionsBySource.get(sourceId).push(transaction);
  });

  // Find potential transfer pairs
  const sourceIds = Array.from(transactionsBySource.keys());
  
  // Look for transfers between different sources
  for (let i = 0; i < sourceIds.length; i++) {
    for (let j = i + 1; j < sourceIds.length; j++) {
      const source1 = sourceIds[i];
      const source2 = sourceIds[j];
      
      const source1Transactions = transactionsBySource.get(source1);
      const source2Transactions = transactionsBySource.get(source2);
      
      // Look for matching credit/debit pairs
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
    
    // Group by user within this source
    const transactionsByUser = new Map();
    sourceTransactions.forEach(transaction => {
      const userId = transaction.user;
      if (!transactionsByUser.has(userId)) {
        transactionsByUser.set(userId, []);
      }
      transactionsByUser.get(userId).push(transaction);
    });
    
    const userIds = Array.from(transactionsByUser.keys());
    
    // Look for transfers between different users within the same source
    for (let i = 0; i < userIds.length; i++) {
      for (let j = i + 1; j < userIds.length; j++) {
        const user1 = userIds[i];
        const user2 = userIds[j];
        
        const user1Transactions = transactionsByUser.get(user1);
        const user2Transactions = transactionsByUser.get(user2);
        
        // Look for matching credit/debit pairs
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
    
    // Determine transfer type based on users
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
  // Must be from different sources OR same source but different users
  const source1 = t1.metadata?.sourceId || 'manual';
  const source2 = t2.metadata?.sourceId || 'manual';
  const user1 = t1.user;
  const user2 = t2.user;
  
  // If same source, must be different users
  if (source1 === source2 && user1 === user2) return false;
  
  // Must be opposite types (income vs expense)
  if (t1.type === t2.type) return false;
  
  // Must have EXACT matching amounts (no tolerance)
  if (Math.abs(t1.amount) !== Math.abs(t2.amount)) return false;
  
  // Must be within ±4 days
  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 4) return false;
  
  return true;
}

function calculateTransferConfidence(t1, t2) {
  let confidence = 0.5; // Base confidence
  
  // Amount match (exact match = higher confidence)
  if (Math.abs(t1.amount) === Math.abs(t2.amount)) {
    confidence += 0.4; // Exact amount match gets high confidence
  } else {
    return 0; // No confidence if amounts don't match exactly
  }
  
  // Date proximity (closer = higher confidence)
  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff === 0) confidence += 0.2;
  else if (daysDiff <= 1) confidence += 0.15;
  else if (daysDiff <= 2) confidence += 0.1;
  else if (daysDiff <= 3) confidence += 0.05;
  
  // Description similarity
  const desc1 = t1.description.toLowerCase();
  const desc2 = t2.description.toLowerCase();
  if (desc1.includes('transfer') || desc2.includes('transfer')) confidence += 0.1;
  if (desc1.includes('move') || desc2.includes('move')) confidence += 0.05;
  
  return Math.min(confidence, 1);
}

// Helper functions
function getArtifactsDir() {
  return '.artifacts';
}

function getFilePath(filename) {
  return path.join(getArtifactsDir(), filename);
}

function ensureArtifactsDir() {
  const dir = getArtifactsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Main script
function rerunTransferDetection() {
  console.log('🔄 Starting transfer detection re-run...');
  
  const mode = 'PRODUCTION';
  console.log(`📁 Mode: ${mode}`);
  
  ensureArtifactsDir();
  
  // Debug: Show current working directory and artifacts directory
  console.log(`📂 Current working directory: ${process.cwd()}`);
  console.log(`📂 Artifacts directory: ${getArtifactsDir()}`);
  
  // Read existing expenses
  const expensesPath = getFilePath('transactions.json');
  console.log(`🔍 Looking for file: ${expensesPath}`);
  console.log(`🔍 File exists: ${fs.existsSync(expensesPath)}`);
  
  if (!fs.existsSync(expensesPath)) {
    console.log('❌ No transactions file found. Nothing to process.');
    
    // List files in artifacts directory to help debug
    const artifactsDir = getArtifactsDir();
    if (fs.existsSync(artifactsDir)) {
      console.log(`📋 Files in ${artifactsDir}:`);
      const files = fs.readdirSync(artifactsDir);
      files.forEach(file => {
        const filePath = path.join(artifactsDir, file);
        const stats = fs.statSync(filePath);
        console.log(`   ${file} (${stats.isDirectory() ? 'dir' : 'file'})`);
      });
    } else {
      console.log(`❌ Artifacts directory ${artifactsDir} does not exist`);
    }
    return;
  }
  
  console.log(`📖 Reading transactions from: ${expensesPath}`);
  const expenses = JSON.parse(fs.readFileSync(expensesPath, 'utf8'));
  console.log(`📊 Found ${expenses.length} transactions`);
  
  // Count existing transfers
  const existingTransfers = expenses.filter(exp => exp.transferInfo?.isTransfer);
  console.log(`🔄 Found ${existingTransfers.length} existing transfers`);
  
  // Remove existing transfer info from all transactions
  console.log('🧹 Removing existing transfer info...');
  const cleanedExpenses = expenses.map(exp => {
    const { transferInfo, ...rest } = exp;
    return rest;
  });
  
  // Run transfer detection
  console.log('🔍 Running transfer detection...');
  const { transfers, updatedTransactions } = detectTransfers(cleanedExpenses);
  
  console.log(`✅ Detected ${transfers.length} transfer pairs`);
  
  // Count transfer types
  const userTransfers = transfers.filter(t => t.credit.user !== t.debit.user);
  const selfTransfers = transfers.filter(t => t.credit.user === t.debit.user);
  
  console.log(`👥 User transfers: ${userTransfers.length}`);
  console.log(`🔄 Transfer/Refunds: ${selfTransfers.length}`);
  
  // Save updated expenses
  const outputPath = getFilePath('transactions.json');
  fs.writeFileSync(outputPath, JSON.stringify(updatedTransactions, null, 2));
  console.log(`💾 Saved updated transactions to: ${outputPath}`);
  
  // Create a summary report
  const summary = {
    timestamp: new Date().toISOString(),
    mode,
    totalTransactions: expenses.length,
    existingTransfers: existingTransfers.length,
    newTransfers: transfers.length,
    userTransfers: userTransfers.length,
    selfTransfers: selfTransfers.length,
    transferDetails: transfers.map(t => ({
      transferId: t.transferId,
      type: t.credit.user === t.debit.user ? 'self' : 'user',
      credit: {
        id: t.credit.id,
        description: t.credit.description,
        user: t.credit.user,
        amount: t.credit.amount,
        date: t.credit.date
      },
      debit: {
        id: t.debit.id,
        description: t.debit.description,
        user: t.debit.user,
        amount: t.debit.amount,
        date: t.debit.date
      }
    }))
  };
  
  const summaryPath = getFilePath('transfer_detection_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`📋 Saved summary to: ${summaryPath}`);
  
  console.log('✅ Transfer detection re-run completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Total transactions: ${expenses.length}`);
  console.log(`   Transfers detected: ${transfers.length}`);
  console.log(`   User transfers: ${userTransfers.length}`);
  console.log(`   Transfer/Refunds: ${selfTransfers.length}`);
}

// Run the script
if (require.main === module) {
  try {
    rerunTransferDetection();
  } catch (error) {
    console.error('❌ Error running transfer detection:', error);
    process.exit(1);
  }
}

module.exports = { rerunTransferDetection };