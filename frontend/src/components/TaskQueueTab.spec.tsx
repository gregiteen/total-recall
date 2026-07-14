import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskQueueTab from './TaskQueueTab';

describe('TaskQueueTab', () => {
  const defaultProps = {
    tasks: [],
    loading: false,
    showTaskForm: false,
    setShowTaskForm: vi.fn(),
    taskCategory: 'fact-seeker',
    setTaskCategory: vi.fn(),
    taskTarget: '',
    setTaskTarget: vi.fn(),
    taskBody: '',
    setTaskBody: vi.fn(),
    taskSubmitting: false,
    handleCreateTask: vi.fn(),
  };

  it('renders correctly with no data', () => {
    render(<TaskQueueTab {...defaultProps} />);
    expect(screen.getByText('Active Scheduler Tasks')).toBeInTheDocument();
    expect(screen.getByText('No tasks are currently running.')).toBeInTheDocument();
  });

  it('shows task form when showTaskForm is true', () => {
    render(<TaskQueueTab {...defaultProps} showTaskForm={true} />);
    expect(screen.getByPlaceholderText(/e.g. Audit security.yml files/)).toBeInTheDocument();
  });

  it('renders tasks', () => {
    const tasks = [
      {
        slug: 't1',
        category: 'fact-seeker',
        target: 'Test target 1',
        body: 'test body',
        status: 'pending' as const,
        priority: 1
      }
    ];

    render(<TaskQueueTab {...defaultProps} tasks={tasks} />);
    
    expect(screen.getByText('Test target 1')).toBeInTheDocument();
    expect(screen.getByText('test body')).toBeInTheDocument();
    expect(screen.getByText('fact-seeker')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('handles form interactions', () => {
    const setTaskTarget = vi.fn();
    render(<TaskQueueTab {...defaultProps} showTaskForm={true} setTaskTarget={setTaskTarget} />);
    
    const input = screen.getByPlaceholderText(/e.g. Audit security.yml files/);
    fireEvent.change(input, { target: { value: 'New target' } });
    
    expect(setTaskTarget).toHaveBeenCalledWith('New target');
  });

  it('calls handleCreateTask on submit', () => {
    const handleCreateTask = vi.fn(e => e.preventDefault());
    render(<TaskQueueTab {...defaultProps} showTaskForm={true} taskTarget="test" handleCreateTask={handleCreateTask} />);
    
    fireEvent.click(screen.getByText('Create Task'));
    
    expect(handleCreateTask).toHaveBeenCalled();
  });
});
