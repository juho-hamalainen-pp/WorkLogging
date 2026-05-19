import { fireEvent, render, screen } from '@testing-library/react-native';
import App from './App';

let currentTime = 0;
let nowSpy: jest.SpyInstance<number, []>;

const addTask = (name: string) => {
  fireEvent.changeText(screen.getByPlaceholderText('New task name'), name);
  fireEvent.press(screen.getByText('Add'));
};

const advanceTime = (ms: number) => {
  currentTime += ms;
};

describe('App', () => {
  beforeEach(() => {
    currentTime = Date.now();
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  it('shows timer empty state by default', () => {
    render(<App />);

    expect(screen.getByText('No tasks yet. Add one above to start tracking.')).toBeTruthy();
  });

  it('adds a task and trims whitespace from task names', () => {
    render(<App />);

    addTask('  Deep Work  ');

    expect(screen.getByText('Deep Work')).toBeTruthy();
    expect(screen.queryByDisplayValue('  Deep Work  ')).toBeNull();
  });

  it('records a time entry when a task is started and stopped', () => {
    render(<App />);

    addTask('Testing Task');
    fireEvent.press(screen.getByText('Start'));
    advanceTime(65_000);
    fireEvent.press(screen.getByText('Stop'));

    fireEvent.press(screen.getByText('Log'));
    expect(screen.getByText('Testing Task')).toBeTruthy();
    expect(screen.getByText('00:01:05')).toBeTruthy();
  });

  it('stops an already-running task when starting another one', () => {
    render(<App />);

    addTask('Task One');
    addTask('Task Two');

    fireEvent.press(screen.getAllByText('Start')[0]);
    advanceTime(30_000);
    fireEvent.press(screen.getAllByText('Start')[0]);

    expect(screen.getByText('Task One')).toBeTruthy();
    expect(screen.getByText('Task Two')).toBeTruthy();
    expect(screen.getByText('Stop')).toBeTruthy();
    expect(screen.getAllByText('Start')).toHaveLength(1);

    fireEvent.press(screen.getByText('Log'));
    expect(screen.getByText('Task One')).toBeTruthy();
    expect(screen.getByText('00:00:30')).toBeTruthy();
  });

  it('shows analytics totals, session count, and average duration', () => {
    render(<App />);

    addTask('Analytics Task');

    fireEvent.press(screen.getByText('Start'));
    advanceTime(60_000);
    fireEvent.press(screen.getByText('Stop'));

    fireEvent.press(screen.getByText('Start'));
    advanceTime(120_000);
    fireEvent.press(screen.getByText('Stop'));

    fireEvent.press(screen.getByText('Analytics'));

    expect(screen.getByText('Total Time: 00:03:00')).toBeTruthy();
    expect(screen.getByText('Today: 00:03:00')).toBeTruthy();
    expect(screen.getByText('Total: 00:03:00')).toBeTruthy();
    expect(screen.getByText('Sessions: 2')).toBeTruthy();
    expect(screen.getByText('Avg: 00:01:30')).toBeTruthy();
  });

  it('deletes a task and removes its time entries', () => {
    render(<App />);

    addTask('Disposable Task');
    fireEvent.press(screen.getByText('Start'));
    advanceTime(10_000);
    fireEvent.press(screen.getByText('Stop'));

    fireEvent.press(screen.getByText('Delete'));
    expect(screen.queryByText('Disposable Task')).toBeNull();

    fireEvent.press(screen.getByText('Log'));
    expect(screen.getByText('No time entries yet.')).toBeTruthy();
  });

  it('deletes an individual entry from the log tab', () => {
    render(<App />);

    addTask('Log Entry Task');
    fireEvent.press(screen.getByText('Start'));
    advanceTime(15_000);
    fireEvent.press(screen.getByText('Stop'));

    fireEvent.press(screen.getByText('Log'));
    fireEvent.press(screen.getByText('Delete'));
    expect(screen.getByText('No time entries yet.')).toBeTruthy();
  });
});
