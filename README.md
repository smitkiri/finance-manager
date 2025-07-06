# Expense Tracker

A modern, beautiful web application for tracking personal expenses and income. Built with React, TypeScript, and Tailwind CSS with a Node.js backend for data persistence.

## Features

- 💰 **Track Expenses & Income**: Add, edit, and delete transactions
- 👥 **Multi-User Support**: Manage multiple users with individual transaction tracking
- 🤖 **Intelligent Category Matching**: Auto-suggest categories based on similar transaction descriptions
- 📊 **Visual Analytics**: Interactive charts showing spending patterns and trends
- 📈 **Real-time Statistics**: Live updates of totals and net amounts
- 🏷️ **Category Management**: Organize transactions by categories with dedicated settings
- 🏷️ **Label System**: Add up to 3 custom labels to transactions for better organization
- 📁 **Advanced CSV Import/Export**: Import any CSV structure with column mapping and preview editing
- 🔍 **Advanced Filtering & Search**: Full-text search, date presets, amount ranges, and save/load filter configurations
- 📅 **Global Date Range Picker**: Synchronized date filtering across dashboard and transactions
- 📱 **Responsive Design**: Works perfectly on desktop and mobile
- 🎨 **Dark Mode**: Beautiful dark theme with automatic system preference detection
- 💾 **Local Data Persistence**: Data saved locally with backend API and localStorage fallback
- 📄 **Pagination**: Load transactions in batches with "Show More" functionality
- ⚡ **Quick Category Editing**: Click category badges to change categories inline
- 🔧 **Settings Management**: Comprehensive settings modal with categories, sources, users, and data management
- 📊 **Report Builder**: Create custom reports with advanced filtering and data analysis
- 🔄 **Smart Transfer Detection**: Automatically detect and handle internal transfers between accounts
- 🧪 **Test Mode**: Safe testing environment with separate data storage
- 📋 **Transaction Details**: Detailed view of transactions with metadata and transfer information
- 🗂️ **Source Management**: Organize and edit CSV import sources
- 📊 **Separate Income/Expense Breakdowns**: View income and expense categories separately
- 🎯 **Transaction Exclusion**: Exclude specific transactions from calculations
- 🔔 **Toast Notifications**: User-friendly notifications for auto-filled categories and import status

## Screenshots

The application features a clean, modern interface with:
- Dashboard with key statistics and synchronized date range filtering
- Interactive charts for data visualization (Monthly Overview, Category Trends, Savings)
- Separate income and expense category breakdowns
- Transaction list with pagination, labels, and quick editing
- Modal forms for adding/editing transactions
- Comprehensive settings page for categories, sources, users, and data management
- Report builder with advanced filtering options
- Dark mode support throughout the interface
- Test mode indicators for safe development
- User filter dropdown in the header
- Advanced search and filtering sidebar

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

### Multi-User Support
1. **User Management**: Go to Settings → Users tab to add, edit, or delete users
2. **User Filter**: Use the user dropdown in the header to filter transactions by user
3. **Transaction Association**: All new transactions are associated with the selected user
4. **CSV Import**: User selection is required when importing CSV files to associate transactions
5. **Required User Selection**: Users must explicitly select a user for all transactions and imports

### Adding Transactions
1. Click the "Add Transaction" button
2. Fill in the transaction details (date, description, category, amount, type)
3. Select a user from the dropdown
4. Add an optional memo and up to 3 labels
5. Click "Add Transaction" to save

### Intelligent Category Matching
- **Automatic Suggestions**: When importing CSV files with missing categories, the system automatically suggests categories based on similar transaction descriptions
- **Smart Algorithm**: Uses multiple matching methods including word similarity, substring matching, and merchant name detection
- **Recent Transactions**: Analyzes the most recent 100 transactions for category suggestions
- **Toast Notifications**: Receive notifications showing how many categories were auto-filled
- **Manual Override**: You can still manually edit categories after auto-suggestion

### Date Range Filtering
1. Use the global date range picker in the header (synchronized across all pages)
2. Choose from quick shortcuts: "1M", "3M", "6M", "1Y"
3. Select a specific month from the month picker
4. Set a custom date range with start and end dates
5. Your selection is automatically saved and restored on app restart

### Advanced Filtering & Search
1. **Full-Text Search**: Search transaction descriptions, categories, and labels
2. **Date Presets**: Quick filters for "This Month", "Last Month", "This Year", etc.
3. **Amount Range**: Filter by minimum and maximum amounts
4. **Save/Load Filters**: Save frequently used filter combinations and load them later
5. **Combined Filters**: All filters work together for precise data views
6. **Search Bar**: Located below the transactions heading for easy access

### Category Management
1. Click the settings icon (gear) in the header
2. Navigate to the "Categories" tab
3. View all current categories
4. Add new categories with the "Add Category" button
5. Edit existing categories by clicking the edit icon
6. Delete categories (with confirmation for categories that have transactions)
7. Categories are automatically synced across the app

### User Management
1. Click the settings icon (gear) in the header
2. Navigate to the "Users" tab
3. View all users with creation dates
4. Add new users with the "Add User" button
5. Edit user names by clicking the edit icon
6. Delete users (with confirmation for users that have transactions)
7. Users are automatically synced across the app

### Source Management
1. Click the settings icon (gear) in the header
2. Navigate to the "Sources" tab
3. View all CSV import sources with creation and last used dates
4. Edit source names by clicking the edit icon
5. Sources are automatically created when importing CSV files

### Label System
1. Add up to 3 custom labels to any transaction
2. Use labels for additional organization (e.g., "Business", "Personal", "Travel")
3. Filter transactions by labels in the transaction filters
4. Labels are displayed as colored badges on transactions

### Quick Category Editing
1. Click on any category badge in the transaction list
2. Select a new category from the dropdown (sorted by most recently used)
3. Changes are saved immediately
4. Use Escape key or click outside to cancel

### Importing Data
1. Click "Import CSV" in the header
2. Select any CSV file with your transaction data
3. Choose a user to associate with the imported transactions
4. Map your CSV columns to the required fields:
   - Date (required)
   - Description (required)
   - Amount (required)
   - Category (optional - will be auto-suggested if missing)
   - Type (optional)
   - Memo (optional)
5. Preview and edit the data before import
6. Delete unwanted rows or override categories
7. Save the mapping as a source for future imports
8. Click "Import" to add the transactions
9. Receive toast notifications for auto-filled categories

### Exporting Data
1. Go to Settings → General tab
2. Click "Export CSV" to download your transactions as a CSV file

### Advanced Filtering
- **Type Filter**: Filter by expenses, income, or both
- **Category Filter**: Filter by specific categories
- **Label Filter**: Filter by custom labels
- **Source Filter**: Filter by CSV import sources
- **User Filter**: Filter by specific users
- **Amount Range**: Filter by minimum and maximum amounts
- **Date Range**: Use the global date range picker
- **Full-Text Search**: Search across descriptions, categories, and labels
- **Combined Filters**: All filters work together for precise data views

### Report Builder
1. Navigate to the "Reports" tab
2. Click "Create New Report"
3. Set a name and description
4. Configure filters (date range, categories, labels, sources, users, etc.)
5. Preview the filtered data
6. Save the report for future use
7. View saved reports and their results

### Transfer Detection
- **Automatic Detection**: The app automatically detects internal transfers between accounts
- **Smart Filtering**: Transfers are excluded from calculations by default
- **Visual Indicators**: Transfer transactions are greyed out in the list
- **Manual Override**: Click transaction details to include/exclude transfers from calculations
- **Transfer Pairs**: View related transfer transactions in the details modal

### Test Mode
1. Go to Settings → General tab
2. Click "Enable Test Mode" for safe testing
3. Test mode uses separate data storage (`.test_artifacts`)
4. Visual indicators show when test mode is active
5. Perfect for testing new features without affecting real data

### Transaction Details
1. Click on any transaction in the list
2. View comprehensive transaction information including:
   - All transaction details
   - Labels and metadata
   - Source information (if imported)
   - Transfer information (if applicable)
   - Options to exclude from calculations
   - Transfer override settings

### Data Management
1. Go to Settings → General tab
2. **Export Data**: Download all transactions as CSV
3. **Delete All Data**: Remove all transactions and sources
4. **Selective Deletion**: Choose specific data to delete
5. **Test Mode**: Safe testing environment with separate storage

### Toast Notifications
- **Auto-Filled Categories**: Receive notifications when categories are automatically suggested during CSV import
- **Import Status**: Get feedback on successful imports and any errors
- **User-Friendly**: Non-intrusive notifications that appear in the bottom-right corner
- **Auto-Dismiss**: Notifications automatically disappear after 5 seconds
- **Manual Dismiss**: Click to dismiss notifications early

## Technology Stack

- **Frontend**: React 18 with TypeScript
- **Backend**: Node.js with Express
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **Icons**: Lucide React
- **Build Tool**: Create React App
- **Data Persistence**: Local file system with JSON storage
- **State Management**: React Context for theme and test mode
- **Notifications**: React Toastify for toast notifications
- **Date Handling**: date-fns for date manipulation
- **Utilities**: clsx and tailwind-merge for conditional styling

## Recent Updates

### Multi-User Support
- Added user management system with add, edit, and delete functionality
- User filter dropdown in the header to filter transactions by user
- All transactions now associated with specific users
- CSV import requires user selection
- Default user handling for backward compatibility

### Intelligent Category Matching
- Automatic category suggestions based on similar transaction descriptions
- Multi-method similarity algorithm (word matching, substring matching, merchant detection)
- Analyzes recent 100 transactions for suggestions
- Toast notifications for auto-filled categories
- Fallback to "Uncategorized" if no good match found

### Advanced Filtering & Search
- Full-text search across transaction descriptions, categories, and labels
- Advanced date presets (This Month, Last Month, This Year, etc.)
- Amount range filtering with min/max values
- Save and load filter configurations with localStorage persistence
- Search bar moved to transactions page for better accessibility
- Removed redundant date range filter from sidebar

### UI/UX Improvements
- Custom dropdown components with smooth animations
- Category dropdown sorted by most recently used
- User dropdown with custom styling matching the app design
- Toast notification system for user feedback
- Improved transaction list layout with better information display
- Enhanced search and filtering interface

### Backend Enhancements
- Intelligent category matching algorithm
- Multi-user support in all API endpoints
- Enhanced CSV import with user association
- Auto-filled category tracking and reporting
- Improved error handling and validation

## Project Structure

```
expense_tracker/
├── src/
│   ├── components/          # React components
│   │   ├── modals/         # Modal components
│   │   │   ├── Settings.tsx     # Comprehensive settings modal
│   │   │   ├── TransactionForm.tsx  # Transaction form modal
│   │   │   ├── TransactionDetailsModal.tsx # Transaction details
│   │   │   └── SourceModal.tsx  # CSV import source modal
│   │   ├── transactions/   # Transaction-related components
│   │   │   ├── TransactionList.tsx  # Transaction list with pagination
│   │   │   ├── TransactionFilters.tsx # Advanced filtering sidebar
│   │   │   └── TransactionForm.tsx  # Transaction form
│   │   ├── reports/        # Report components
│   │   │   ├── Reports.tsx      # Reports list and creation
│   │   │   ├── ReportCreator.tsx # Report builder
│   │   │   └── ReportViewer.tsx  # Report display
│   │   ├── Dashboard.tsx   # Main dashboard with charts
│   │   ├── StatsCard.tsx   # Statistics cards
│   │   ├── Chart.tsx       # Chart components
│   │   ├── DateRangePicker.tsx # Date range filtering
│   │   └── Sidebar.tsx     # Navigation sidebar
│   ├── contexts/           # React contexts
│   │   ├── ThemeContext.tsx    # Dark/light theme
│   │   └── TestModeContext.tsx # Test mode state
│   ├── types.ts            # TypeScript type definitions
│   ├── utils.ts            # Utility functions
│   ├── utils/
│   │   ├── storage.ts      # Data persistence utilities
│   │   └── reportUtils.ts  # Report generation utilities
│   ├── App.tsx             # Main application component
│   ├── index.tsx           # Application entry point
│   └── index.css           # Global styles
├── server.js               # Express backend server
├── .artifacts/             # Local data storage
│   ├── transactions.json   # Transaction data
│   ├── categories.json     # Category data
│   ├── source.json         # CSV import sources
│   ├── date-range.json     # Date range preferences
│   └── reports/            # Saved reports
└── samples/
    └── sample_expenses.csv # Sample data for testing
```

## Features in Detail

### Enhanced Dashboard
- **Total Expenses**: Sum of all expense transactions in the selected date range
- **Total Income**: Sum of all income transactions in the selected date range
- **Net Amount**: Income minus expenses
- **Visual Indicators**: Color-coded values (red for expenses, green for income)
- **Separate Breakdowns**: Income and expense categories shown separately
- **Monthly Overview**: Line chart showing expenses vs income over time (past to current)
- **Category Trends**: Interactive line chart for expense categories over time
- **Savings Chart**: Bar chart showing monthly savings
- **Donut Chart**: Visual representation of savings vs expenses

### Advanced Transaction Management
- **Add**: Modal form with validation, date picker, and label support
- **Edit**: Click edit icon to modify existing transactions
- **Delete**: Click delete icon to remove transactions with confirmation
- **Quick Category Edit**: Click category badges for inline editing
- **Label Management**: Add/remove up to 3 labels per transaction
- **Transaction Details**: Comprehensive view with metadata and transfer info
- **Exclusion Control**: Exclude transactions from calculations
- **Pagination**: Load transactions in batches for better performance

### Smart Transfer Detection
- **Automatic Detection**: Identifies transfers between accounts within ±2 days
- **Confidence Scoring**: Calculates transfer confidence based on amount matching
- **Visual Indicators**: Transfer transactions are greyed out
- **Manual Override**: Users can include/exclude transfers from calculations
- **Transfer Pairs**: View related transactions in details modal
- **Metadata Tracking**: Stores transfer information with transactions

### Report System
- **Custom Reports**: Create reports with advanced filtering
- **Filter Options**: Date range, categories, labels, sources, amount ranges
- **Data Preview**: See filtered data before saving reports
- **Report Storage**: Reports saved locally with metadata
- **Report Viewer**: View saved reports with full data analysis
- **Export Results**: Export report data for external analysis

### Data Import/Export
- **Flexible CSV Import**: Import any CSV structure with column mapping
- **Source Management**: Save and reuse import configurations
- **CSV Preview**: Edit data before import, delete rows, override categories
- **CSV Export**: Download filtered transactions for backup or analysis
- **Sample Data**: Includes sample CSV file for testing
- **Metadata Tracking**: Track source and import date for all imported transactions

### Test Mode
- **Safe Testing**: Separate data storage for development and testing
- **Visual Indicators**: Clear indication when test mode is active
- **Easy Toggle**: Enable/disable test mode from settings
- **Data Isolation**: Test data completely separate from production data
- **Development Friendly**: Perfect for testing new features

### Data Persistence
- **Local Storage**: Data saved in `.artifacts` directory with JSON files
- **Backend API**: Express server handles file operations
- **Fallback**: localStorage used when backend is unavailable
- **Automatic Sync**: Data automatically synced between frontend and backend
- **Test Mode Storage**: Separate `.test_artifacts` directory for testing

### User Experience
- **Dark Mode**: Beautiful dark theme with system preference detection
- **Responsive Design**: Optimized for desktop, tablet, and mobile
- **Keyboard Support**: Full keyboard navigation and shortcuts
- **Smooth Animations**: Modern UI with smooth transitions
- **Auto-save**: All changes saved automatically
- **Global Date Range**: Synchronized date filtering across all pages
- **Test Mode Indicators**: Clear visual feedback for test mode
- **Loading States**: Proper loading indicators throughout the app

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