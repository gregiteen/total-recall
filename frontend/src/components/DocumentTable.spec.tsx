import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentTable } from './DocumentTable';

describe('DocumentTable', () => {
  const columns = [
    { key: 'name', header: 'Name' },
    { key: 'status', header: 'Status' }
  ];

  it('renders table headers and data rows correctly', () => {
    const data = [
      { id: 1, name: 'Doc 1', status: 'Active' },
      { id: 2, name: 'Doc 2', status: 'Draft' }
    ];

    render(<DocumentTable data={data} columns={columns} />);

    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();

    expect(screen.getByText('Doc 1')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Doc 2')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders custom column render correctly', () => {
    const customCols = [
      ...columns,
      { key: 'action', header: 'Action', render: (row: any) => <button>Edit {row.name}</button> }
    ];
    const data = [{ id: 1, name: 'Doc 1', status: 'Active' }];

    render(<DocumentTable data={data} columns={customCols} />);

    expect(screen.getByText('Edit Doc 1')).toBeInTheDocument();
  });

  it('renders empty message when no data', () => {
    render(<DocumentTable data={[]} columns={columns} emptyMessage="No items" />);

    expect(screen.getByText('No items')).toBeInTheDocument();
  });
});
