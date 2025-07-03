const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Ensure artifacts directory exists
const ARTIFACTS_DIR = '.artifacts';
const EXPENSES_FILE = path.join(ARTIFACTS_DIR, 'expenses.json');
const METADATA_FILE = path.join(ARTIFACTS_DIR, 'metadata.json');

if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

// Routes
app.get('/api/expenses', (req, res) => {
  try {
    if (!fs.existsSync(EXPENSES_FILE)) {
      return res.json([]);
    }
    
    const data = fs.readFileSync(EXPENSES_FILE, 'utf8');
    const expenses = JSON.parse(data);
    res.json(expenses);
  } catch (error) {
    console.error('Error reading expenses:', error);
    res.status(500).json({ error: 'Failed to read expenses' });
  }
});

app.post('/api/expenses', (req, res) => {
  try {
    const { expenses, metadata } = req.body;
    
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 2));
    
    if (metadata) {
      fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
    }
    
    res.json({ success: true, count: expenses.length });
  } catch (error) {
    console.error('Error saving expenses:', error);
    res.status(500).json({ error: 'Failed to save expenses' });
  }
});

app.post('/api/import-csv', (req, res) => {
  try {
    const { csvText } = req.body;
    
    // Parse CSV and save
    const expenses = parseCSV(csvText);
    
    // Load existing expenses
    let existingExpenses = [];
    if (fs.existsSync(EXPENSES_FILE)) {
      const data = fs.readFileSync(EXPENSES_FILE, 'utf8');
      existingExpenses = JSON.parse(data);
    }
    
    // Merge expenses
    const mergedExpenses = mergeExpenses(existingExpenses, expenses);
    
    // Save merged data
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(mergedExpenses, null, 2));
    
    res.json({ 
      success: true, 
      imported: expenses.length,
      total: mergedExpenses.length 
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    res.status(500).json({ error: 'Failed to import CSV' });
  }
});

app.get('/api/export-csv', (req, res) => {
  try {
    if (!fs.existsSync(EXPENSES_FILE)) {
      return res.status(404).json({ error: 'No expenses found' });
    }
    
    const data = fs.readFileSync(EXPENSES_FILE, 'utf8');
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
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=expenses.csv');
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Helper functions
function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1)
    .filter((line) => {
      const values = line.split(',');
      const type = values[4] || '';
      return type !== 'Payment';
    })
    .map((line, index) => {
      const values = line.split(',');
      const amount = parseFloat(values[5]) || 0;
      
      return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        date: values[0],
        description: values[2],
        category: values[3] || 'Uncategorized',
        amount: Math.abs(amount),
        type: amount < 0 ? 'expense' : 'income',
        memo: values[6] || '',
      };
    });
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Artifacts directory: ${path.resolve(ARTIFACTS_DIR)}`);
}); 