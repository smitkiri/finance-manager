import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { PanelEditor } from './PanelEditor';
import { LocalStorage } from '../../utils/storage';
import { Dashboard, DashboardPanel } from '../../types';

jest.mock('../../utils/storage', () => ({
  LocalStorage: {
    previewPanelTransactions: jest.fn().mockResolvedValue({ transactions: [], total: 0 }),
    chartPreview: jest.fn().mockResolvedValue({ rows: [], monthMap: {} }),
    createPanel: jest.fn().mockResolvedValue({}),
    updatePanel: jest.fn().mockResolvedValue({}),
  },
}));

// Mock child components to simplify testing
jest.mock('./PanelChart', () => ({
  PanelChart: () => <div data-testid="panel-chart" />,
}));
jest.mock('./ChartLegend', () => ({
  ChartLegend: () => <div data-testid="chart-legend" />,
}));
jest.mock('./TransactionPreview', () => ({
  TransactionPreview: () => <div data-testid="transaction-preview" />,
}));
jest.mock('./FilterBuilder', () => ({
  FilterBuilder: () => <div data-testid="filter-builder" />,
}));

const mockDashboard: Dashboard = {
  id: 'dash-1',
  name: 'Test Dashboard',
  isDefault: false,
  dateRangeStart: '2025-01-01',
  dateRangeEnd: '2025-12-31',
  panelCount: 0,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const mockPanel: DashboardPanel = {
  id: 'panel-1',
  dashboardId: 'dash-1',
  title: 'Existing Panel',
  chartType: 'line',
  seriesMode: 'net_amount',
  netOrientation: 'expense_positive',
  legendOptions: { show: true, min: true, max: false, avg: true, total: false },
  filterGroups: [],
  panelOrder: 1,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const defaultProps = {
  dashboard: mockDashboard,
  panel: null as DashboardPanel | null,
  categories: ['Food', 'Transport'],
  allLabels: ['label1', 'label2'],
  selectedUserId: 'user-1',
  dateRange: { start: new Date('2025-01-01'), end: new Date('2025-12-31') },
  onSave: jest.fn(),
  onCancel: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('PanelEditor', () => {
  // 1. Create mode rendering
  test('renders in create mode with empty title and default settings', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} />);
    });

    const titleInput = screen.getByPlaceholderText('Untitled Panel');
    expect(titleInput).toHaveValue('');

    // Default chart type is bar - the bar button should have the active style
    const barButton = screen.getByRole('button', { name: 'bar' });
    expect(barButton).toHaveClass('bg-blue-500');

    // Default series mode is two_series
    const twoSeriesButton = screen.getByRole('button', { name: 'Two Series' });
    expect(twoSeriesButton).toHaveClass('bg-blue-500');

    // Orientation should NOT be visible when seriesMode is two_series
    expect(screen.queryByText('Orientation')).not.toBeInTheDocument();

    // Legend default is Off
    const legendButton = screen.getByRole('button', { name: 'Off' });
    expect(legendButton).toBeInTheDocument();

    // Save button should be disabled (empty title)
    const saveButton = screen.getByRole('button', { name: 'Save Panel' });
    expect(saveButton).toBeDisabled();
  });

  // 2. Edit mode rendering
  test('renders in edit mode with panel data populated', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} panel={mockPanel} />);
    });

    const titleInput = screen.getByPlaceholderText('Untitled Panel');
    expect(titleInput).toHaveValue('Existing Panel');

    // Chart type should be line
    const lineButton = screen.getByRole('button', { name: 'line' });
    expect(lineButton).toHaveClass('bg-blue-500');

    // Series mode should be net_amount
    const netAmountButton = screen.getByRole('button', { name: 'Net Amount' });
    expect(netAmountButton).toHaveClass('bg-blue-500');

    // Orientation should be visible since seriesMode is net_amount
    expect(screen.getByText('Orientation')).toBeInTheDocument();

    // Legend should be On
    const legendButton = screen.getByRole('button', { name: 'On' });
    expect(legendButton).toBeInTheDocument();

    // Legend stat options should be visible
    expect(screen.getByRole('button', { name: 'min' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'max' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'avg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'total' })).toBeInTheDocument();
  });

  // 3. Title input updates
  test('title input updates correctly when typing', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} />);
    });

    const titleInput = screen.getByPlaceholderText('Untitled Panel');

    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'My New Panel' } });
    });

    expect(titleInput).toHaveValue('My New Panel');
  });

  // 4. Chart type toggle
  test('clicking line switches chart type from bar to line', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} />);
    });

    const lineButton = screen.getByRole('button', { name: 'line' });
    const barButton = screen.getByRole('button', { name: 'bar' });

    // Initially bar is active
    expect(barButton).toHaveClass('bg-blue-500');
    expect(lineButton).not.toHaveClass('bg-blue-500');

    await act(async () => {
      fireEvent.click(lineButton);
    });

    // Now line should be active
    expect(lineButton).toHaveClass('bg-blue-500');
    expect(barButton).not.toHaveClass('bg-blue-500');
  });

  // 5. Series mode toggle shows orientation options
  test('clicking Net Amount shows orientation options', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} />);
    });

    // Orientation not visible initially
    expect(screen.queryByText('Orientation')).not.toBeInTheDocument();

    const netAmountButton = screen.getByRole('button', { name: 'Net Amount' });

    await act(async () => {
      fireEvent.click(netAmountButton);
    });

    // Orientation should now be visible
    expect(screen.getByText('Orientation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Income/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Expense/ })).toBeInTheDocument();
  });

  // 6. Legend toggle shows stat options
  test('clicking legend On shows stat options', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} />);
    });

    // Stats not visible initially
    expect(screen.queryByRole('button', { name: 'min' })).not.toBeInTheDocument();

    const legendButton = screen.getByRole('button', { name: 'Off' });

    await act(async () => {
      fireEvent.click(legendButton);
    });

    // Legend should now show On and stat buttons
    expect(screen.getByRole('button', { name: 'On' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'min' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'max' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'avg' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'total' })).toBeInTheDocument();
  });

  // 7. Save button disabled when title is empty
  test('save button is disabled when title is empty', async () => {
    await act(async () => {
      render(<PanelEditor {...defaultProps} />);
    });

    const saveButton = screen.getByRole('button', { name: 'Save Panel' });
    expect(saveButton).toBeDisabled();

    // Type a title
    const titleInput = screen.getByPlaceholderText('Untitled Panel');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Panel Title' } });
    });

    expect(saveButton).not.toBeDisabled();

    // Clear the title
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: '' } });
    });

    expect(saveButton).toBeDisabled();
  });

  // 8. Save calls createPanel in create mode
  test('save button calls LocalStorage.createPanel in create mode', async () => {
    const onSave = jest.fn();
    const savedPanel = {
      id: 'test-id',
      dashboardId: 'dash-1',
      title: 'New Panel',
      chartType: 'bar',
      seriesMode: 'two_series',
      netOrientation: null,
      legendOptions: null,
      filterGroups: [],
      panelOrder: 0,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };
    (LocalStorage.createPanel as jest.Mock).mockResolvedValueOnce(savedPanel);

    await act(async () => {
      render(<PanelEditor {...defaultProps} onSave={onSave} />);
    });

    // Type a title
    const titleInput = screen.getByPlaceholderText('Untitled Panel');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'New Panel' } });
    });

    const saveButton = screen.getByRole('button', { name: 'Save Panel' });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(LocalStorage.createPanel).toHaveBeenCalledWith(
      'dash-1',
      expect.objectContaining({
        title: 'New Panel',
        chartType: 'bar',
        seriesMode: 'two_series',
        netOrientation: null,
        legendOptions: null,
        filterGroups: [],
        panelOrder: 0,
      })
    );
    expect(LocalStorage.updatePanel).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(savedPanel);
    });
  });

  // 9. Save calls updatePanel in edit mode
  test('save button calls LocalStorage.updatePanel in edit mode', async () => {
    const onSave = jest.fn();
    const updatedPanel = { ...mockPanel, title: 'Updated Panel' };
    (LocalStorage.updatePanel as jest.Mock).mockResolvedValueOnce(updatedPanel);

    await act(async () => {
      render(<PanelEditor {...defaultProps} panel={mockPanel} onSave={onSave} />);
    });

    const saveButton = screen.getByRole('button', { name: 'Save Panel' });

    await act(async () => {
      fireEvent.click(saveButton);
    });

    expect(LocalStorage.updatePanel).toHaveBeenCalledWith(
      'panel-1',
      expect.objectContaining({
        id: 'panel-1',
        title: 'Existing Panel',
        chartType: 'line',
        seriesMode: 'net_amount',
      })
    );
    expect(LocalStorage.createPanel).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(updatedPanel);
    });
  });

  // 10. Back button calls onCancel
  test('back button calls onCancel', async () => {
    const onCancel = jest.fn();

    await act(async () => {
      render(<PanelEditor {...defaultProps} onCancel={onCancel} />);
    });

    const backButton = screen.getByRole('button', { name: /Back/ });
    fireEvent.click(backButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  // 11. Cancel button calls onCancel
  test('cancel button calls onCancel', async () => {
    const onCancel = jest.fn();

    await act(async () => {
      render(<PanelEditor {...defaultProps} onCancel={onCancel} />);
    });

    const cancelButton = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
