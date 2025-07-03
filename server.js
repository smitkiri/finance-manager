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
const MAPPINGS_FILE = path.join(ARTIFACTS_DIR, 'column-mappings.json');
const DATE_RANGE_FILE = path.join(ARTIFACTS_DIR, 'date-range.json');
const CATEGORIES_FILE = path.join(ARTIFACTS_DIR, 'categories.json');

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

// Column Mapping Routes
app.get('/api/column-mappings', (req, res) => {
  try {
    if (!fs.existsSync(MAPPINGS_FILE)) {
      return res.json([]);
    }
    
    const data = fs.readFileSync(MAPPINGS_FILE, 'utf8');
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
    if (fs.existsSync(MAPPINGS_FILE)) {
      const data = fs.readFileSync(MAPPINGS_FILE, 'utf8');
      mappings = JSON.parse(data);
    }
    
    // Add new mapping
    mappings.push(mapping);
    
    // Save mappings
    fs.writeFileSync(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
    
    res.json({ success: true, count: mappings.length });
  } catch (error) {
    console.error('Error saving column mapping:', error);
    res.status(500).json({ error: 'Failed to save column mapping' });
  }
});

app.post('/api/import-with-mapping', (req, res) => {
  try {
    const { csvText, mapping } = req.body;
    
    // Parse CSV with mapping
    const expenses = parseCSVWithMapping(csvText, mapping);
    
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
    console.error('Error importing CSV with mapping:', error);
    res.status(500).json({ error: 'Failed to import CSV with mapping' });
  }
});

// Date Range Routes
app.get('/api/date-range', (req, res) => {
  try {
    if (!fs.existsSync(DATE_RANGE_FILE)) {
      return res.status(404).json({ error: 'No date range found' });
    }
    
    const data = fs.readFileSync(DATE_RANGE_FILE, 'utf8');
    const dateRange = JSON.parse(data);
    res.json(dateRange);
  } catch (error) {
    console.error('Error reading date range:', error);
    res.status(500).json({ error: 'Failed to read date range' });
  }
});

app.post('/api/date-range', (req, res) => {
  try {
    const { start, end } = req.body;
    
    const dateRange = { start, end };
    fs.writeFileSync(DATE_RANGE_FILE, JSON.stringify(dateRange, null, 2));
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving date range:', error);
    res.status(500).json({ error: 'Failed to save date range' });
  }
});

// Category Routes
app.get('/api/categories', (req, res) => {
  try {
    if (!fs.existsSync(CATEGORIES_FILE)) {
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
    
    const data = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const categories = JSON.parse(data);
    res.json({ categories });
  } catch (error) {
    console.error('Error reading categories:', error);
    res.status(500).json({ error: 'Failed to read categories' });
  }
});

app.post('/api/categories', (req, res) => {
  try {
    const { categories } = req.body;
    
    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(categories, null, 2));
    
    res.json({ success: true, count: categories.length });
  } catch (error) {
    console.error('Error saving categories:', error);
    res.status(500).json({ error: 'Failed to save categories' });
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
      };
    })
    .filter(expense => expense.date && expense.description && expense.amount > 0);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Artifacts directory: ${path.resolve(ARTIFACTS_DIR)}`);
}); 