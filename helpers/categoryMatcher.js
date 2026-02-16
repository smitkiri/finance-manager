function findSimilarTransactionCategory(description, existingTransactions, maxResults = 100) {
  if (!description || !existingTransactions || existingTransactions.length === 0) {
    return null;
  }

  const descLower = description.toLowerCase().trim();

  const recentTransactions = existingTransactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, maxResults)
    .filter(t => t.category && t.category !== 'Uncategorized');

  if (recentTransactions.length === 0) {
    return null;
  }

  const similarities = recentTransactions.map(transaction => {
    const transactionDesc = transaction.description.toLowerCase().trim();
    const similarity = calculateDescriptionSimilarity(descLower, transactionDesc);
    return {
      transaction,
      similarity,
      category: transaction.category
    };
  });

  const goodMatches = similarities
    .filter(match => match.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity);

  if (goodMatches.length === 0) {
    return null;
  }

  const categoryScores = new Map();
  goodMatches.forEach(match => {
    const category = match.category;
    if (!categoryScores.has(category)) {
      categoryScores.set(category, { total: 0, count: 0, maxSimilarity: 0 });
    }
    const score = categoryScores.get(category);
    score.total += match.similarity;
    score.count += 1;
    score.maxSimilarity = Math.max(score.maxSimilarity, match.similarity);
  });

  let bestCategory = null;
  let bestScore = 0;

  categoryScores.forEach((score, category) => {
    const avgSimilarity = score.total / score.count;
    const weightedScore = (avgSimilarity * 0.7) + (score.maxSimilarity * 0.3);

    if (weightedScore > bestScore) {
      bestScore = weightedScore;
      bestCategory = category;
    }
  });

  return bestScore > 0.4 ? bestCategory : null;
}

function calculateDescriptionSimilarity(desc1, desc2) {
  if (desc1 === desc2) return 1.0;

  const words1 = new Set(desc1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(desc2.split(/\s+/).filter(w => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  const jaccardSimilarity = intersection.size / union.size;

  let substringScore = 0;
  const words1Array = Array.from(words1);
  const words2Array = Array.from(words2);

  for (const word1 of words1Array) {
    for (const word2 of words2Array) {
      if (word1.includes(word2) || word2.includes(word1)) {
        substringScore += 0.5;
      }
    }
  }
  const normalizedSubstringScore = Math.min(substringScore / Math.max(words1.size, words2.size), 1);

  let merchantScore = 0;
  const commonMerchants = ['amazon', 'walmart', 'target', 'starbucks', 'mcdonalds', 'uber', 'lyft', 'netflix', 'spotify'];
  const desc1Lower = desc1.toLowerCase();
  const desc2Lower = desc2.toLowerCase();

  for (const merchant of commonMerchants) {
    if (desc1Lower.includes(merchant) && desc2Lower.includes(merchant)) {
      merchantScore += 0.3;
    }
  }

  const finalScore = (jaccardSimilarity * 0.5) + (normalizedSubstringScore * 0.3) + (merchantScore * 0.2);

  return Math.min(finalScore, 1.0);
}

module.exports = { findSimilarTransactionCategory, calculateDescriptionSimilarity };
