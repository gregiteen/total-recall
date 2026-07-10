import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

export interface DocumentTableProps<T> {
  data: T[];
  columns: Column<T>[];
  emptyMessage?: string;
}

export function DocumentTable<T extends Record<string, unknown>>({ data, columns, emptyMessage = "No documents found." }: DocumentTableProps<T>) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '10px' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          {columns.map((col, idx) => (
            <th key={col.key} style={{ padding: '10px 0', textAlign: idx === columns.length - 1 && col.header === 'Actions' ? 'right' : 'left' }}>
              {col.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={String(row.id || row.path || i)} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {columns.map((col, idx) => (
              <td key={col.key} style={{ padding: '10px 0', textAlign: idx === columns.length - 1 && col.header === 'Actions' ? 'right' : 'left' }}>
                {col.render ? col.render(row) : String(row[col.key] || '-')}
              </td>
            ))}
          </tr>
        ))}
        {data.length === 0 && (
          <tr>
            <td colSpan={columns.length} style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>
              {emptyMessage}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
