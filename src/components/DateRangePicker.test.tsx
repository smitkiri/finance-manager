import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateRangePicker } from './DateRangePicker';
import { subMonths, subYears, startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

// Fixed "now" for all tests: March 23, 2026 at noon
const FIXED_NOW = new Date(2026, 2, 23, 12, 0, 0);

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

function makeRange(start: Date, end: Date) {
  return { start, end };
}

// Helper: get the trigger button (first button rendered)
function getTriggerButton() {
  // The trigger button contains the formatted date text
  return screen.getAllByRole('button')[0];
}

describe('DateRangePicker', () => {
  // ---- 1. Renders button with formatted date range ----
  describe('renders button with formatted date range', () => {
    it('displays "Since the Beginning" for epoch start', () => {
      const range = makeRange(new Date(0), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Since the Beginning')).toBeInTheDocument();
    });

    it('displays "Last 1 month" for matching quick range', () => {
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Last 1 month')).toBeInTheDocument();
    });

    it('displays "Last 3 months" for matching quick range', () => {
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 3)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Last 3 months')).toBeInTheDocument();
    });

    it('displays "Last 6 months" for matching quick range', () => {
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 6)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Last 6 months')).toBeInTheDocument();
    });

    it('displays "Last 1 year" for matching quick range', () => {
      const range = makeRange(startOfDay(subYears(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Last 1 year')).toBeInTheDocument();
    });

    it('displays month name for a full-month range', () => {
      const feb2026 = new Date(2026, 1, 1);
      const range = makeRange(startOfMonth(feb2026), endOfMonth(feb2026));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('February 2026')).toBeInTheDocument();
    });

    it('displays a single date when start and end are the same day', () => {
      const day = new Date(2026, 2, 15);
      const range = makeRange(startOfDay(day), startOfDay(day));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Mar 15, 2026')).toBeInTheDocument();
    });

    it('displays "start - end" for arbitrary ranges', () => {
      const range = makeRange(new Date(2026, 0, 5), new Date(2026, 2, 10));
      render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
      expect(screen.getByText('Jan 5, 2026 - Mar 10, 2026')).toBeInTheDocument();
    });
  });

  // ---- 2. Clicking button opens the popover ----
  it('opens the popover when the button is clicked', () => {
    const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
    render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);

    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    fireEvent.click(getTriggerButton());
    expect(screen.getByText('Date Range')).toBeInTheDocument();
  });

  // ---- 3. Clicking X closes the popover ----
  it('closes the popover when the X button is clicked', () => {
    const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
    render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);

    fireEvent.click(getTriggerButton());
    expect(screen.getByText('Date Range')).toBeInTheDocument();

    // The X button is the last button in the popover header area
    // It's rendered after the "Date Range" heading
    const allButtons = screen.getAllByRole('button');
    // Find the close button - it's the one right after the trigger button inside the popover
    const closeButton = allButtons[1]; // second button is the X
    fireEvent.click(closeButton);

    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
  });

  // ---- 4 & 5. Quick range buttons call onDateRangeChange with correct ranges and close popover ----
  describe('quick range buttons', () => {
    it('1M calls onDateRangeChange with last 1 month and closes popover', () => {
      const onChange = jest.fn();
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());
      fireEvent.click(screen.getByText('1M'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfDay(subMonths(FIXED_NOW, 1)));
      expect(call.end).toEqual(endOfDay(FIXED_NOW));
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });

    it('3M calls onDateRangeChange with last 3 months and closes popover', () => {
      const onChange = jest.fn();
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());
      fireEvent.click(screen.getByText('3M'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfDay(subMonths(FIXED_NOW, 3)));
      expect(call.end).toEqual(endOfDay(FIXED_NOW));
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });

    it('6M calls onDateRangeChange with last 6 months and closes popover', () => {
      const onChange = jest.fn();
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());
      fireEvent.click(screen.getByText('6M'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfDay(subMonths(FIXED_NOW, 6)));
      expect(call.end).toEqual(endOfDay(FIXED_NOW));
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });

    it('1Y calls onDateRangeChange with last 1 year and closes popover', () => {
      const onChange = jest.fn();
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());
      fireEvent.click(screen.getByText('1Y'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfDay(subYears(FIXED_NOW, 1)));
      expect(call.end).toEqual(endOfDay(FIXED_NOW));
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });
  });

  // ---- 6. Month selection calls onDateRangeChange with correct month bounds ----
  describe('month selection', () => {
    it('selecting a month calls onDateRangeChange with startOfMonth and endOfMonth', () => {
      const onChange = jest.fn();
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());

      // Select February 2026 (offset 1 from current month March 2026)
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '1' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      const feb2026 = subMonths(FIXED_NOW, 1);
      expect(call.start).toEqual(startOfMonth(feb2026));
      expect(call.end).toEqual(endOfMonth(feb2026));
      // Popover should close
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });

    it('selecting the current month (offset 0) gives correct bounds', () => {
      const onChange = jest.fn();
      const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());

      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '0' } });

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfMonth(FIXED_NOW));
      expect(call.end).toEqual(endOfMonth(FIXED_NOW));
    });
  });

  // ---- 7. Custom range: entering dates and clicking Apply calls onDateRangeChange ----
  describe('custom range', () => {
    it('applies custom date range when Apply button is clicked', () => {
      const onChange = jest.fn();
      const range = makeRange(new Date(2026, 0, 1), new Date(2026, 0, 31));
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());

      const dateInputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
      const startInput = dateInputs[0];
      const endInput = dateInputs[1];

      fireEvent.change(startInput, { target: { value: '2026-02-01' } });
      fireEvent.change(endInput, { target: { value: '2026-02-28' } });

      fireEvent.click(screen.getByText('Apply Custom Range'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfDay(new Date(2026, 1, 1)));
      expect(call.end).toEqual(endOfDay(new Date(2026, 1, 28)));
      // Popover should close
      expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
    });

    it('uses existing currentRange dates when Apply is clicked without changes', () => {
      const onChange = jest.fn();
      const start = new Date(2026, 0, 10);
      const end = new Date(2026, 0, 20);
      const range = makeRange(start, end);
      render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

      fireEvent.click(getTriggerButton());
      fireEvent.click(screen.getByText('Apply Custom Range'));

      expect(onChange).toHaveBeenCalledTimes(1);
      const call = onChange.mock.calls[0][0];
      expect(call.start).toEqual(startOfDay(start));
      expect(call.end).toEqual(endOfDay(end));
    });
  });

  // ---- 8. formatDateRange displays "Since the Beginning" for epoch start ----
  it('displays "Since the Beginning" when start is epoch (timestamp 0)', () => {
    const range = makeRange(new Date(0), new Date(2026, 2, 23));
    render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);
    expect(screen.getByText('Since the Beginning')).toBeInTheDocument();
  });

  // ---- 9. Outside click closes the popover ----
  it('closes the popover when clicking outside', () => {
    const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />
      </div>
    );

    fireEvent.click(getTriggerButton());
    expect(screen.getByText('Date Range')).toBeInTheDocument();

    // Click outside the component
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();
  });

  // ---- 10. Popover shows quick ranges, month selector, and custom range sections ----
  it('shows all sections in the popover', () => {
    const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
    render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);

    fireEvent.click(getTriggerButton());

    // Quick Ranges section
    expect(screen.getByText('Quick Ranges')).toBeInTheDocument();
    expect(screen.getByText('1M')).toBeInTheDocument();
    expect(screen.getByText('3M')).toBeInTheDocument();
    expect(screen.getByText('6M')).toBeInTheDocument();
    expect(screen.getByText('1Y')).toBeInTheDocument();

    // Month selector section
    expect(screen.getByText('Select Month')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Choose a month...')).toBeInTheDocument();

    // Month options should include current and past 11 months
    expect(screen.getByText('March 2026')).toBeInTheDocument();
    expect(screen.getByText('April 2025')).toBeInTheDocument();

    // Custom Range section
    expect(screen.getByText('Custom Range')).toBeInTheDocument();
    expect(screen.getByText('Start Date')).toBeInTheDocument();
    expect(screen.getByText('End Date')).toBeInTheDocument();
    expect(screen.getByText('Apply Custom Range')).toBeInTheDocument();
  });

  // ---- Additional edge cases ----
  it('toggles the popover open and closed on repeated trigger clicks', () => {
    const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
    render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);

    fireEvent.click(getTriggerButton());
    expect(screen.getByText('Date Range')).toBeInTheDocument();

    fireEvent.click(getTriggerButton());
    expect(screen.queryByText('Date Range')).not.toBeInTheDocument();

    fireEvent.click(getTriggerButton());
    expect(screen.getByText('Date Range')).toBeInTheDocument();
  });

  it('does not update temp date when invalid date string is entered', () => {
    const onChange = jest.fn();
    const start = new Date(2026, 0, 10);
    const end = new Date(2026, 0, 20);
    const range = makeRange(start, end);
    render(<DateRangePicker currentRange={range} onDateRangeChange={onChange} />);

    fireEvent.click(getTriggerButton());

    const dateInputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    const startInput = dateInputs[0];
    // Enter an incomplete/invalid value
    fireEvent.change(startInput, { target: { value: 'not-a-date' } });

    // Apply should still use the original start date
    fireEvent.click(screen.getByText('Apply Custom Range'));
    const call = onChange.mock.calls[0][0];
    expect(call.start).toEqual(startOfDay(start));
  });

  it('lists 12 month options in the dropdown', () => {
    const range = makeRange(startOfDay(subMonths(FIXED_NOW, 1)), endOfDay(FIXED_NOW));
    render(<DateRangePicker currentRange={range} onDateRangeChange={jest.fn()} />);

    fireEvent.click(getTriggerButton());

    const select = screen.getByRole('combobox');
    // 12 month options + 1 placeholder = 13
    const options = select.querySelectorAll('option');
    expect(options).toHaveLength(13);
  });
});
