const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Test mode state
let isTestMode = false;

// Function to get the appropriate artifacts directory
const getArtifactsDir = () => {
  return isTestMode ? '.test_artifacts' : '.artifacts';
};

// Function to get file paths based on test mode
const getFilePath = (filename) => {
  const artifactsDir = getArtifactsDir();
  return path.join(artifactsDir, filename);
};

// Ensure artifacts directory exists
const ensureArtifactsDir = () => {
  const artifactsDir = getArtifactsDir();
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }
  
  const reportsDir = path.join(artifactsDir, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
};

// Routes
app.get('/api/expenses', (req, res) => {
  try {
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const transactionsFile = getFilePath('transactions.json');
    if (!fs.existsSync(transactionsFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.json([]);
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const expenses = JSON.parse(data);
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json(expenses);
  } catch (error) {
    console.error('Error reading expenses:', error);
    res.status(500).json({ error: 'Failed to read expenses' });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const { expenses, metadata, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    ensureArtifactsDir();
    const transactionsFile = getFilePath('transactions.json');
    const metadataFile = getFilePath('metadata.json');
    
    fs.writeFileSync(transactionsFile, JSON.stringify(expenses, null, 2));
    
    if (metadata) {
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    }
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true, count: expenses.length });
  } catch (error) {
    console.error('Error saving expenses:', error);
    res.status(500).json({ error: 'Failed to save expenses' });
  }
});

app.post('/api/import-csv', (req, res) => {
  try {
    const { csvText, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    // Parse CSV and save
    const expenses = parseCSV(csvText);
    
    // Load existing expenses
    let existingExpenses = [];
    const transactionsFile = getFilePath('transactions.json');
    if (fs.existsSync(transactionsFile)) {
      const data = fs.readFileSync(transactionsFile, 'utf8');
      existingExpenses = JSON.parse(data);
    }
    
    // Merge expenses
    const mergedExpenses = mergeExpenses(existingExpenses, expenses);
    
    // Detect transfers
    const { transfers, updatedTransactions } = detectTransfers(mergedExpenses);
    
    // Save merged data with transfer info
    ensureArtifactsDir();
    fs.writeFileSync(transactionsFile, JSON.stringify(updatedTransactions, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
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

app.get('/api/export-csv', (req, res) => {
  try {
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const transactionsFile = getFilePath('transactions.json');
    if (!fs.existsSync(transactionsFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(404).json({ error: 'No expenses found' });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const expenses = JSON.parse(data);
    
    // Create CSV content
    const headers = ['Date', 'Description', 'Category', 'Amount', 'Type', 'Memo'];
    const csvContent = [
      headers.join(','),
      ...expenses.map(exp => [
        exp.date,
        exp.description,
        exp.category,
        exp.amount,
        exp.type,
        exp.memo || ''
      ].join(','))
    ].join('\n');
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Column Mapping Routes
app.get('/api/column-mappings', (req, res) => {
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

app.post('/api/column-mappings', (req, res) => {
  try {
    const { mapping } = req.body;
    
    // Load existing mappings
    let mappings = [];
    const mappingsFile = getFilePath('mappings.json');
    if (fs.existsSync(mappingsFile)) {
      const data = fs.readFileSync(mappingsFile, 'utf8');
      mappings = JSON.parse(data);
    }
    
    // Add new mapping
    mappings.push(mapping);
    
    // Save mappings
    ensureArtifactsDir();
    fs.writeFileSync(mappingsFile, JSON.stringify(mappings, null, 2));
    
    res.json({ success: true, count: mappings.length });
  } catch (error) {
    console.error('Error saving column mapping:', error);
    res.status(500).json({ error: 'Failed to save column mapping' });
  }
});

app.post('/api/import-with-mapping', (req, res) => {
  try {
    const { csvText, mapping, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    // Parse CSV with mapping
    const expenses = parseCSVWithMapping(csvText, mapping);
    
    // Load existing expenses
    let existingExpenses = [];
    const transactionsFile = getFilePath('transactions.json');
    if (fs.existsSync(transactionsFile)) {
      const data = fs.readFileSync(transactionsFile, 'utf8');
      existingExpenses = JSON.parse(data);
    }
    
    // Merge expenses
    const mergedExpenses = mergeExpenses(existingExpenses, expenses);
    
    // Detect transfers
    const { transfers, updatedTransactions } = detectTransfers(mergedExpenses);
    
    // Save merged data with transfer info
    ensureArtifactsDir();
    fs.writeFileSync(transactionsFile, JSON.stringify(updatedTransactions, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ 
      success: true, 
      imported: expenses.length,
      total: updatedTransactions.length,
      transfersDetected: transfers.length
    });
  } catch (error) {
    console.error('Error importing CSV with mapping:', error);
    res.status(500).json({ error: 'Failed to import CSV with mapping' });
  }
});

// Date Range Routes
app.get('/api/date-range', (req, res) => {
  try {
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const dateRangeFile = getFilePath('date-range.json');
    if (!fs.existsSync(dateRangeFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(404).json({ error: 'No date range found' });
    }
    
    const data = fs.readFileSync(dateRangeFile, 'utf8');
    const dateRange = JSON.parse(data);
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json(dateRange);
  } catch (error) {
    console.error('Error reading date range:', error);
    res.status(500).json({ error: 'Failed to read date range' });
  }
});

app.post('/api/date-range', (req, res) => {
  try {
    const { start, end, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    ensureArtifactsDir();
    const dateRangeFile = getFilePath('date-range.json');
    const dateRange = { start, end };
    fs.writeFileSync(dateRangeFile, JSON.stringify(dateRange, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving date range:', error);
    res.status(500).json({ error: 'Failed to save date range' });
  }
});

// Category Routes
app.get('/api/categories', (req, res) => {
  try {
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const categoriesFile = getFilePath('categories.json');
    if (!fs.existsSync(categoriesFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      // Return default categories if file doesn't exist
      const defaultCategories = [
        'Food & Drink',
        'Shopping',
        'Travel',
        'Health & Wellness',
        'Groceries',
        'Bills & Utilities',
        'Entertainment',
        'Personal',
        'Professional Services',
        'Uncategorized'
      ];
      return res.json({ categories: defaultCategories });
    }
    
    const data = fs.readFileSync(categoriesFile, 'utf8');
    const categories = JSON.parse(data);
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ categories });
  } catch (error) {
    console.error('Error reading categories:', error);
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { categories, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    ensureArtifactsDir();
    const categoriesFile = getFilePath('categories.json');
    fs.writeFileSync(categoriesFile, JSON.stringify(categories, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true, count: categories.length });
  } catch (error) {
    console.error('Error saving categories:', error);
    res.status(500).json({ error: 'Failed to save categories' });
  }
});

// Report Routes
app.get('/api/reports', (req, res) => {
  try {
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const reports = [];
    const reportsDir = path.join(getArtifactsDir(), 'reports');
    
    if (fs.existsSync(reportsDir)) {
      const files = fs.readdirSync(reportsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(reportsDir, file);
          const data = fs.readFileSync(filePath, 'utf8');
          const report = JSON.parse(data);
          reports.push(report);
        }
      }
    }
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json(reports);
  } catch (error) {
    console.error('Error reading reports:', error);
    res.status(500).json({ error: 'Failed to read reports' });
  }
});

app.post('/api/reports', (req, res) => {
  try {
    const { report, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    ensureArtifactsDir();
    const reportsDir = path.join(getArtifactsDir(), 'reports');
    const reportFile = path.join(reportsDir, `${report.id}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true, reportId: report.id });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ error: 'Failed to save report' });
  }
});

app.delete('/api/reports/:reportId', (req, res) => {
  try {
    const { reportId } = req.params;
    const reportsDir = path.join(getArtifactsDir(), 'reports');
    const reportFile = path.join(reportsDir, `${reportId}.json`);
    const reportDataFile = path.join(reportsDir, `${reportId}_data.json`);
    
    // Delete report file
    if (fs.existsSync(reportFile)) {
      fs.unlinkSync(reportFile);
    }
    
    // Delete report data file
    if (fs.existsSync(reportDataFile)) {
      fs.unlinkSync(reportDataFile);
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: 'Failed to delete report' });
  }
});

app.post('/api/reports/:reportId/data', (req, res) => {
  try {
    const { reportId } = req.params;
    const { reportData, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    ensureArtifactsDir();
    const reportsDir = path.join(getArtifactsDir(), 'reports');
    const reportDataFile = path.join(reportsDir, `${reportId}_data.json`);
    fs.writeFileSync(reportDataFile, JSON.stringify(reportData, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving report data:', error);
    res.status(500).json({ error: 'Failed to save report data' });
  }
});

app.get('/api/reports/:reportId/data', (req, res) => {
  try {
    const { reportId } = req.params;
    
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const reportsDir = path.join(getArtifactsDir(), 'reports');
    const reportDataFile = path.join(reportsDir, `${reportId}_data.json`);
    
    if (!fs.existsSync(reportDataFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(404).json({ error: 'Report data not found' });
    }
    
    const data = fs.readFileSync(reportDataFile, 'utf8');
    const reportData = JSON.parse(data);
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json(reportData);
  } catch (error) {
    console.error('Error reading report data:', error);
    res.status(500).json({ error: 'Failed to read report data' });
  }
});

// Source Routes
app.get('/api/sources', (req, res) => {
  try {
    // Check if test mode is requested via query parameter
    const requestTestMode = req.query.testMode === 'true';
    const originalTestMode = isTestMode;
    
    // Temporarily set test mode for this request
    if (requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const sourcesFile = getFilePath('source.json');
    if (!fs.existsSync(sourcesFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.json([]);
    }
    const data = fs.readFileSync(sourcesFile, 'utf8');
    const sources = JSON.parse(data);
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json(sources);
  } catch (error) {
    console.error('Error reading sources:', error);
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

app.post('/api/sources', (req, res) => {
  try {
    const { source, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    // Load existing sources
    let sources = [];
    const sourcesFile = getFilePath('source.json');
    
    if (fs.existsSync(sourcesFile)) {
      const data = fs.readFileSync(sourcesFile, 'utf8');
      sources = JSON.parse(data);
    }
    
    // Check if source name already exists
    if (sources.some(s => s.name === source.name)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(400).json({ error: 'Source name already exists' });
    }
    
    // Add new source
    sources.push(source);
    
    ensureArtifactsDir();
    fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error saving source:', error);
    res.status(500).json({ error: 'Failed to save source' });
  }
});

app.delete('/api/sources/:sourceName', (req, res) => {
  try {
    const { sourceName } = req.params;
    const sourcesFile = getFilePath('source.json');
    
    if (!fs.existsSync(sourcesFile)) {
      return res.status(404).json({ error: 'No sources found' });
    }
    
    const data = fs.readFileSync(sourcesFile, 'utf8');
    let sources = JSON.parse(data);
    
    // Remove the source
    sources = sources.filter(s => s.name !== sourceName);
    
    fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));
    
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// Update source
app.put('/api/sources/:sourceId', (req, res) => {
  try {
    const { sourceId } = req.params;
    const { source, isTestMode } = req.body;
    
    const sourcesFile = getFilePath('source.json');
    
    if (!fs.existsSync(sourcesFile)) {
      return res.status(404).json({ error: 'No sources found' });
    }
    
    const data = fs.readFileSync(sourcesFile, 'utf8');
    let sources = JSON.parse(data);
    
    // Find and update the source
    const sourceIndex = sources.findIndex(s => s.id === sourceId);
    if (sourceIndex === -1) {
      return res.status(404).json({ error: 'Source not found' });
    }
    
    // Check if the new name conflicts with other sources
    const nameConflict = sources.some(s => s.id !== sourceId && s.name === source.name);
    if (nameConflict) {
      return res.status(400).json({ error: 'Source name already exists' });
    }
    
    // Update the source
    sources[sourceIndex] = source;
    
    fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));
    
    res.json({ success: true, sources });
  } catch (error) {
    console.error('Error updating source:', error);
    res.status(500).json({ error: 'Failed to update source' });
  }
});

// Delete all data (transactions and sources)
app.delete('/api/delete-all', (req, res) => {
  try {
    const transactionsFile = getFilePath('transactions.json');
    const sourcesFile = getFilePath('source.json');
    
    if (fs.existsSync(transactionsFile)) fs.unlinkSync(transactionsFile);
    if (fs.existsSync(sourcesFile)) fs.unlinkSync(sourcesFile);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting all data:', error);
    res.status(500).json({ error: 'Failed to delete all data' });
  }
});

// Delete selected data
app.post('/api/delete-selected', (req, res) => {
  try {
    const { deleteTransactions, deleteSources, sourceIds } = req.body;
    
    // Delete all transactions
    if (deleteTransactions) {
      const transactionsFile = getFilePath('transactions.json');
      if (fs.existsSync(transactionsFile)) {
        fs.writeFileSync(transactionsFile, JSON.stringify([], null, 2));
      }
    }
    
    // Delete selected sources
    if (deleteSources && Array.isArray(sourceIds)) {
      const sourcesFile = getFilePath('source.json');
      if (fs.existsSync(sourcesFile)) {
        let sources = JSON.parse(fs.readFileSync(sourcesFile, 'utf8'));
        sources = sources.filter(source => !sourceIds.includes(source.id));
        fs.writeFileSync(sourcesFile, JSON.stringify(sources, null, 2));
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting selected data:', error);
    res.status(500).json({ error: 'Failed to delete selected data' });
  }
});

// Helper functions
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
        memo: values[6] || '',
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
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
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

function parseCSVWithMapping(csvText, mapping) {
  const lines = csvText.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  
  // Create a mapping from CSV column index to standardized column
  const columnIndexMap = new Map();
  mapping.mappings.forEach(m => {
    if (m.standardColumn !== 'Ignore') {
      const csvIndex = headers.findIndex(h => h === m.csvColumn);
      if (csvIndex !== -1) {
        columnIndexMap.set(csvIndex, m.standardColumn);
      }
    }
  });

  return lines.slice(1)
    .map((line, index) => {
      const values = parseCSVLine(line);
      
      // Extract values based on mapping
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
            amount = parseFloat(value.replace(/[,$"]/g, '')) || 0;
            break;
        }
      });

      return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        date,
        description,
        category,
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
        memo: '',
        metadata: {
          sourceId: mapping.id,
          sourceName: mapping.name,
          importedAt: new Date().toISOString()
        }
      };
    })
    .filter(expense => expense.date && expense.description && expense.amount > 0);
}

// Transfer detection functions
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

function isTransferPair(t1, t2) {
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
  
  return true;
}

function calculateTransferConfidence(t1, t2) {
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

// Transfer management endpoint
app.post('/api/transfer-override', (req, res) => {
  try {
    const { transactionId, includeInCalculations, isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const transactionsFile = getFilePath('transactions.json');
    if (!fs.existsSync(transactionsFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(404).json({ error: 'No transactions found' });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const transactions = JSON.parse(data);
    
    // Find and update the transaction
    const transactionIndex = transactions.findIndex(t => t.id === transactionId);
    if (transactionIndex === -1) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(404).json({ error: 'Transaction not found' });
    }
    
    const transaction = transactions[transactionIndex];
    if (!transaction.transferInfo?.isTransfer) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(400).json({ error: 'Transaction is not a transfer' });
    }
    
    // Update the transfer info
    transactions[transactionIndex] = {
      ...transaction,
      transferInfo: {
        ...transaction.transferInfo,
        excludedFromCalculations: !includeInCalculations,
        userOverride: true
      }
    };
    
    // If this is part of a transfer pair, update the other transaction too
    if (transaction.transferInfo.transferId) {
      const transferId = transaction.transferInfo.transferId;
      const otherTransactionIndex = transactions.findIndex(t => 
        t.id !== transactionId && 
        t.transferInfo?.transferId === transferId
      );
      
      if (otherTransactionIndex !== -1) {
        transactions[otherTransactionIndex] = {
          ...transactions[otherTransactionIndex],
          transferInfo: {
            ...transactions[otherTransactionIndex].transferInfo,
            excludedFromCalculations: !includeInCalculations,
            userOverride: true
          }
        };
      }
    }
    
    // Save updated transactions
    fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating transfer override:', error);
    res.status(500).json({ error: 'Failed to update transfer override' });
  }
});

// Manual transfer detection endpoint
app.post('/api/detect-transfers', (req, res) => {
  try {
    const { isTestMode: requestTestMode } = req.body;
    
    // Temporarily set test mode for this request
    const originalTestMode = isTestMode;
    if (requestTestMode !== undefined && requestTestMode !== isTestMode) {
      isTestMode = requestTestMode;
    }
    
    const transactionsFile = getFilePath('transactions.json');
    if (!fs.existsSync(transactionsFile)) {
      // Restore original test mode
      isTestMode = originalTestMode;
      return res.status(404).json({ error: 'No transactions found' });
    }
    
    const data = fs.readFileSync(transactionsFile, 'utf8');
    const transactions = JSON.parse(data);
    
    // Detect transfers
    const { transfers, updatedTransactions } = detectTransfers(transactions);
    
    // Save updated transactions with transfer info
    fs.writeFileSync(transactionsFile, JSON.stringify(updatedTransactions, null, 2));
    
    // Restore original test mode
    isTestMode = originalTestMode;
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

// Test mode endpoint
app.get('/api/test-mode', (req, res) => {
  res.json({ isTestMode });
});

app.post('/api/test-mode', (req, res) => {
  try {
    const { isTestMode: newTestMode } = req.body;
    isTestMode = newTestMode;
    
    // Ensure the new artifacts directory exists
    ensureArtifactsDir();
    
    res.json({ success: true, isTestMode });
  } catch (error) {
    console.error('Error setting test mode:', error);
    res.status(500).json({ error: 'Failed to set test mode' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Artifacts directory: ${path.resolve(getArtifactsDir())}`);
}); 