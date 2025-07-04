import { Expense } from '../types';

export interface TransferPair {
  credit: Expense;
  debit: Expense;
  transferId: string;
  confidence: number;
}

export interface TransferDetectionResult {
  transfers: TransferPair[];
  updatedTransactions: Expense[];
}

/**
 * Detects internal transfers between different sources
 * Matches credit/debit transactions from different sources within ±2 days
 */
export function detectTransfers(transactions: Expense[]): TransferDetectionResult {
  const transfers: TransferPair[] = [];
  const updatedTransactions = [...transactions];
  const processedIds = new Set<string>();

  // Group transactions by source
  const transactionsBySource = new Map<string, Expense[]>();
  
  transactions.forEach(transaction => {
    const sourceId = transaction.metadata?.sourceId || 'manual';
    if (!transactionsBySource.has(sourceId)) {
      transactionsBySource.set(sourceId, []);
    }
    transactionsBySource.get(sourceId)!.push(transaction);
  });

  // Find potential transfer pairs
  const sourceIds = Array.from(transactionsBySource.keys());
  
  for (let i = 0; i < sourceIds.length; i++) {
    for (let j = i + 1; j < sourceIds.length; j++) {
      const source1 = sourceIds[i];
      const source2 = sourceIds[j];
      
      const source1Transactions = transactionsBySource.get(source1)!;
      const source2Transactions = transactionsBySource.get(source2)!;
      
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

  // Update transactions with transfer info
  transfers.forEach(transfer => {
    const creditIndex = updatedTransactions.findIndex(t => t.id === transfer.credit.id);
    const debitIndex = updatedTransactions.findIndex(t => t.id === transfer.debit.id);
    
    if (creditIndex !== -1) {
      updatedTransactions[creditIndex] = {
        ...updatedTransactions[creditIndex],
        transferInfo: {
          isTransfer: true,
          transferId: transfer.transferId,
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
          excludedFromCalculations: true,
          userOverride: false
        }
      };
    }
  });

  return { transfers, updatedTransactions };
}

/**
 * Checks if two transactions form a transfer pair
 */
function isTransferPair(t1: Expense, t2: Expense): boolean {
  // Must be from different sources
  const source1 = t1.metadata?.sourceId || 'manual';
  const source2 = t2.metadata?.sourceId || 'manual';
  if (source1 === source2) return false;
  
  // Must be opposite types (income vs expense)
  if (t1.type === t2.type) return false;
  
  // Must have matching amounts (within small tolerance for fees)
  const amountDiff = Math.abs(Math.abs(t1.amount) - Math.abs(t2.amount));
  const tolerance = Math.max(Math.abs(t1.amount), Math.abs(t2.amount)) * 0.01; // 1% tolerance
  if (amountDiff > tolerance) return false;
  
  // Must be within ±4 days
  const date1 = new Date(t1.date);
  const date2 = new Date(t2.date);
  const daysDiff = Math.abs(date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff > 4) return false;
  
  // Check for similar descriptions (optional, for higher confidence)
  const desc1 = t1.description.toLowerCase();
  const desc2 = t2.description.toLowerCase();
  const hasSimilarDescription = desc1.includes('transfer') || desc2.includes('transfer') ||
                               desc1.includes('move') || desc2.includes('move') ||
                               desc1.includes('send') || desc2.includes('send');
  
  return true;
}

/**
 * Calculates confidence score for a transfer pair (0-1)
 */
function calculateTransferConfidence(t1: Expense, t2: Expense): number {
  let confidence = 0.5; // Base confidence
  
  // Amount match (exact match = higher confidence)
  const amountDiff = Math.abs(Math.abs(t1.amount) - Math.abs(t2.amount));
  const tolerance = Math.max(Math.abs(t1.amount), Math.abs(t2.amount)) * 0.01;
  if (amountDiff === 0) confidence += 0.3;
  else if (amountDiff <= tolerance) confidence += 0.2;
  
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

/**
 * Filters out transfer transactions from calculations based on user preferences
 */
export function filterTransfersForCalculations(transactions: Expense[]): Expense[] {
  return transactions.filter(transaction => {
    if (!transaction.transferInfo?.isTransfer) return true;
    
    // Include if user has explicitly overridden the exclusion
    if (transaction.transferInfo.userOverride !== undefined) {
      return !transaction.transferInfo.excludedFromCalculations;
    }
    
    // Default behavior: exclude transfers from calculations
    return !transaction.transferInfo.excludedFromCalculations;
  });
}

/**
 * Gets the transfer pair for a given transaction
 */
export function getTransferPair(transaction: Expense, allTransactions: Expense[]): TransferPair | null {
  if (!transaction.transferInfo?.isTransfer || !transaction.transferInfo.transferId) {
    return null;
  }
  
  const transferId = transaction.transferInfo.transferId;
  const transferTransactions = allTransactions.filter(t => 
    t.transferInfo?.transferId === transferId
  );
  
  if (transferTransactions.length !== 2) return null;
  
  const credit = transferTransactions.find(t => t.type === 'income')!;
  const debit = transferTransactions.find(t => t.type === 'expense')!;
  
  return {
    credit,
    debit,
    transferId,
    confidence: 0.8 // Default confidence for existing transfers
  };
} 