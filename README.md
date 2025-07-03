# Expense Tracker

A modern, beautiful web application for tracking personal expenses and income. Built with React, TypeScript, and Tailwind CSS.

## Features

- 💰 **Track Expenses & Income**: Add, edit, and delete transactions
- 📊 **Visual Analytics**: Interactive charts showing spending patterns
- 📈 **Real-time Statistics**: Live updates of totals and net amounts
- 🏷️ **Category Management**: Organize transactions by categories
- 📁 **CSV Import/Export**: Import existing data or export your transactions
- 🔍 **Smart Filtering**: Filter by transaction type or category
- 📱 **Responsive Design**: Works perfectly on desktop and mobile
- 🎨 **Modern UI**: Beautiful, intuitive interface with smooth animations

## Screenshots

The application features a clean, modern interface with:
- Dashboard with key statistics
- Interactive charts for data visualization
- Transaction list with filtering capabilities
- Modal forms for adding/editing transactions

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

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

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

### Importing Data
1. Click "Import CSV" in the header
2. Select a CSV file with the following columns:
   - Transaction Date
   - Post Date
   - Description
   - Category
   - Type
   - Amount
   - Memo

### Exporting Data
1. Click "Export CSV" in the header
2. Your transactions will be downloaded as a CSV file

### Filtering Transactions
Use the filter dropdown to view:
- All transactions
- Expenses only
- Income only
- Transactions by specific category

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Build Tool**: Create React App

## Project Structure

```
src/
├── components/          # React components
│   ├── ExpenseForm.tsx  # Transaction form modal
│   ├── ExpenseList.tsx  # Transaction list display
│   ├── StatsCard.tsx    # Statistics cards
│   └── Chart.tsx        # Chart components
├── types.ts            # TypeScript type definitions
├── utils.ts            # Utility functions
├── App.tsx             # Main application component
├── index.tsx           # Application entry point
└── index.css           # Global styles
```

## Features in Detail

### Statistics Dashboard
- **Total Expenses**: Sum of all expense transactions
- **Total Income**: Sum of all income transactions  
- **Net Amount**: Income minus expenses
- **Visual Indicators**: Color-coded values (red for expenses, green for income)

### Charts
- **Monthly Overview**: Line chart showing expenses vs income over time
- **Category Breakdown**: Pie chart showing spending by category

### Transaction Management
- **Add**: Modal form with validation
- **Edit**: Click edit icon to modify existing transactions
- **Delete**: Click delete icon to remove transactions
- **Filter**: Filter by type or category

### Data Import/Export
- **CSV Import**: Upload existing transaction data
- **CSV Export**: Download all transactions for backup or analysis
- **Sample Data**: Includes sample CSV file for testing

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