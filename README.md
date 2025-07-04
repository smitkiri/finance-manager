# Expense Tracker

A modern, beautiful web application for tracking personal expenses and income. Built with React, TypeScript, and Tailwind CSS with a Node.js backend for data persistence.

## Features

- 💰 **Track Expenses & Income**: Add, edit, and delete transactions
- 📊 **Visual Analytics**: Interactive charts showing spending patterns
- 📈 **Real-time Statistics**: Live updates of totals and net amounts
- 🏷️ **Category Management**: Organize transactions by categories with a dedicated settings page
- 📁 **Advanced CSV Import/Export**: Import any CSV structure with column mapping and preview editing
- 🔍 **Smart Filtering**: Filter by transaction type, category, and date range
- 📅 **Date Range Picker**: Filter transactions by custom date ranges with quick shortcuts
- 📱 **Responsive Design**: Works perfectly on desktop and mobile
- 🎨 **Dark Mode**: Beautiful dark theme with automatic system preference detection
- 💾 **Local Data Persistence**: Data saved locally with backend API and localStorage fallback
- 📄 **Pagination**: Load transactions in batches with "Show More" functionality
- ⚡ **Quick Category Editing**: Click category badges to change categories inline
- 🔧 **Settings Management**: Dedicated settings modal for category management

## Screenshots

The application features a clean, modern interface with:
- Dashboard with key statistics and date range filtering
- Interactive charts for data visualization
- Transaction list with pagination and quick category editing
- Modal forms for adding/editing transactions
- Settings page for category management
- Dark mode support throughout the interface

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd expense_tracker
```

2. Install dependencies:
```bash
npm install
```

3. Start the backend server:
```bash
npm run server
```

4. In a new terminal, start the development server:
```bash
npm start
```

5. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

### Building for Production

```bash
npm run build
```

## Usage

### Adding Transactions
1. Click the "Add Transaction" button
2. Fill in the transaction details (date, description, category, amount, type)
3. Add an optional memo
4. Click "Add Transaction" to save

### Date Range Filtering
1. Use the date range picker in the header
2. Choose from quick shortcuts: "Last 7 days", "Last 30 days", "Last 6 months", "This year"
3. Select a specific month from the month picker
4. Set a custom date range with start and end dates
5. Your selection is automatically saved and restored on app restart

### Category Management
1. Click the settings icon (gear) in the header
2. View all current categories
3. Add new categories with the "Add Category" button
4. Edit existing categories by clicking the edit icon
5. Delete categories (with confirmation for categories that have transactions)
6. Categories are automatically synced across the app

### Quick Category Editing
1. Click on any category badge in the transaction list
2. Select a new category from the dropdown
3. Changes are saved immediately
4. Use Escape key or click outside to cancel

### Importing Data
1. Click "Import CSV" in the header
2. Select any CSV file with your transaction data
3. Map your CSV columns to the required fields:
   - Date (required)
   - Description (required)
   - Amount (required)
   - Category (optional)
   - Type (optional)
   - Memo (optional)
4. Preview and edit the data before import
5. Delete unwanted rows or override categories
6. Click "Import" to add the transactions

### Exporting Data
1. Click "Export CSV" in the header
2. Your filtered transactions will be downloaded as a CSV file

### Filtering Transactions
- **Type Filter**: Use the dropdown to view all, expenses only, or income only
- **Category Filter**: Filter by specific categories
- **Date Range**: Use the date range picker to filter by time period
- **Combined Filters**: All filters work together for precise data views

### Pagination
- Transactions are loaded 30 at a time initially
- Click "Show More" to load additional transactions
- Pagination respects all active filters

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Backend**: Node.js with Express
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Build Tool**: Create React App
- **Data Persistence**: Local file system with JSON storage

## Project Structure

```
expense_tracker/
├── src/
│   ├── components/          # React components
│   │   ├── TransactionForm.tsx  # Transaction form modal
│   │   ├── TransactionList.tsx  # Transaction list with pagination
│   │   ├── StatsCard.tsx    # Statistics cards
│   │   ├── Chart.tsx        # Chart components
│   │   ├── DateRangePicker.tsx # Date range filtering
│   │   ├── CSVImportModal.tsx  # CSV import with mapping
│   │   ├── CSVPreviewEditor.tsx # CSV preview and editing
│   │   └── Settings.tsx     # Settings modal for categories
│   ├── types.ts            # TypeScript type definitions
│   ├── utils.ts            # Utility functions
│   ├── App.tsx             # Main application component
│   ├── index.tsx           # Application entry point
│   └── index.css           # Global styles
├── server/
│   ├── server.js           # Express backend server
│   └── routes/
│       ├── expenses.js     # Expense CRUD operations
│       ├── categories.js   # Category management
│       ├── csv.js          # CSV import/export
│       └── dateRange.js    # Date range persistence
├── .artifacts/             # Local data storage
│   ├── expenses.json       # Transaction data
│   ├── categories.json     # Category data
│   ├── column-mappings.json # CSV column mappings
│   └── date-range.json     # Date range preferences
└── samples/
    └── sample_expenses.csv # Sample data for testing
```

## Features in Detail

### Statistics Dashboard
- **Total Expenses**: Sum of all expense transactions in the selected date range
- **Total Income**: Sum of all income transactions in the selected date range
- **Net Amount**: Income minus expenses
- **Visual Indicators**: Color-coded values (red for expenses, green for income)
- **Category Breakdown**: Table showing spending by category with percentages

### Charts
- **Monthly Overview**: Line chart showing expenses vs income over time
- **Category Breakdown**: Pie chart showing spending by category
- **Responsive Design**: Charts adapt to different screen sizes

### Transaction Management
- **Add**: Modal form with validation and date picker
- **Edit**: Click edit icon to modify existing transactions
- **Delete**: Click delete icon to remove transactions with confirmation
- **Quick Category Edit**: Click category badges for inline editing
- **Pagination**: Load transactions in batches for better performance

### Data Import/Export
- **Flexible CSV Import**: Import any CSV structure with column mapping
- **CSV Preview**: Edit data before import, delete rows, override categories
- **CSV Export**: Download filtered transactions for backup or analysis
- **Sample Data**: Includes sample CSV file for testing

### Data Persistence
- **Local Storage**: Data saved in `.artifacts` directory with JSON files
- **Backend API**: Express server handles file operations
- **Fallback**: localStorage used when backend is unavailable
- **Automatic Sync**: Data automatically synced between frontend and backend

### User Experience
- **Dark Mode**: Beautiful dark theme with system preference detection
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Keyboard Support**: Full keyboard navigation and shortcuts
- **Smooth Animations**: Modern UI with smooth transitions
- **Auto-save**: All changes saved automatically

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

If you encounter any issues or have questions, please open an issue on GitHub. 