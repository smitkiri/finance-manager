# Code Organization

This document outlines the improved code organization structure for the expense tracker application.

## Directory Structure

```
src/
├── components/
│   ├── transactions/     # Transaction-related components
│   │   ├── TransactionList.tsx
│   │   ├── TransactionForm.tsx
│   │   └── Transactions.tsx
│   ├── ui/              # Reusable UI components
│   │   ├── LabelBadge.tsx
│   │   ├── LabelSelector.tsx
│   │   └── StatsCard.tsx
│   ├── modals/          # Modal components
│   │   ├── CSVMappingModal.tsx
│   │   ├── CSVPreviewEditor.tsx
│   │   └── Settings.tsx
│   ├── charts/          # Chart and visualization components
│   │   ├── Chart.tsx
│   │   └── CategoryTable.tsx
│   ├── Sidebar.tsx      # Layout components
│   ├── Dashboard.tsx
│   ├── DateRangePicker.tsx
│   └── index.ts         # Component exports
├── hooks/               # Custom React hooks
│   ├── useTransactions.ts
│   ├── useCategories.ts
│   ├── useFilters.ts
│   └── index.ts
├── services/            # API and external service calls
│   └── csvService.ts
├── constants/           # Application constants
│   └── index.ts
├── contexts/            # React contexts
│   └── ThemeContext.tsx
├── utils/               # Utility functions
│   ├── storage.ts
│   └── utils.ts
├── types.ts             # TypeScript type definitions
├── App.tsx              # Main application component
└── index.tsx            # Application entry point
```

## Key Improvements

### 1. **Custom Hooks**
- **`useTransactions`**: Manages all transaction-related state and operations
- **`useCategories`**: Handles category management
- **`useFilters`**: Manages filtering logic and state

### 2. **Component Organization**
- **`transactions/`**: All transaction-related components (`TransactionList`, `TransactionForm`, `Transactions`)
- **`ui/`**: Reusable UI components (`LabelBadge`, `LabelSelector`, `StatsCard`)
- **`modals/`**: Modal components (`CSVMappingModal`, `CSVPreviewEditor`, `Settings`)
- **`charts/`**: Visualization components (`Chart`, `CategoryTable`)

### 3. **Services Layer**
- **`csvService`**: Handles CSV import/export operations
- Centralizes API calls and external service interactions

### 4. **Constants**
- Centralized configuration values
- Easy to maintain and update

### 5. **Index Files**
- Clean imports with barrel exports
- Easier to manage dependencies

## Benefits

1. **Separation of Concerns**: Each directory has a specific purpose
2. **Reusability**: UI components are separated for reuse
3. **Maintainability**: Related code is grouped together
4. **Scalability**: Easy to add new features without cluttering existing code
5. **Testing**: Easier to test isolated components and hooks
6. **Type Safety**: Better TypeScript organization

## Usage Examples

### Importing Components
```typescript
// Before
import { TransactionList } from './components/TransactionList';
import { LabelBadge } from './components/LabelBadge';
import { CSVMappingModal } from './components/CSVMappingModal';

// After (direct path)
import { TransactionList } from './components/transactions/TransactionList';
import { LabelBadge } from './components/ui/LabelBadge';
import { CSVMappingModal } from './components/modals/CSVMappingModal';

// Or, using the barrel export (if you maintain index.ts):
import { TransactionList, LabelBadge, CSVMappingModal } from './components';
```

### Using Custom Hooks
```typescript
import { useTransactions, useCategories, useFilters } from './hooks';

function MyComponent() {
  const { expenses, addExpense } = useTransactions();
  const { categories } = useCategories();
  const { filteredExpenses } = useFilters(expenses);
  // ...
}
```

### Using Services
```typescript
import { csvService } from './services/csvService';

// Import CSV data
await csvService.importWithMapping(mapping);

// Export data
await csvService.exportData();
```

## Troubleshooting After Refactoring

### 1. **Import Path Errors**
- If you see errors like `Module not found: Error: Can't resolve './components/TransactionForm'`, update your import paths to match the new structure (e.g., `./components/transactions/TransactionForm`).
- Use relative paths that reflect the new folder locations.

### 2. **Build Errors**
- After moving files, always run `npm run build` to catch any broken imports or missing files.
- Fix any import errors as described above.

### 3. **ESLint Warnings**
- You may see warnings about unused variables (e.g., `isCalendarOpen is assigned a value but never used`).
- These are not fatal, but you can clean them up for a tidier codebase.

### 4. **Component Not Rendering**
- Double-check that you are importing from the correct path and that the component is exported from its new location.

## Migration Notes

- All existing functionality remains the same
- Components are now better organized and easier to find
- Custom hooks reduce code duplication in App.tsx
- Services provide a clean API for external operations 