import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentEditorModal } from './DocumentEditorModal';

describe('DocumentEditorModal', () => {
  it('renders in "New Document" mode', () => {
    render(
      <DocumentEditorModal
        isNew={true}
        editingPath=""
        newPath="test/path.md"
        editContent="Test content"
        saving={false}
        onPathChange={() => {}}
        onContentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText('New Document')).toBeInTheDocument();
    
    const pathInput = screen.getByDisplayValue('test/path.md') as HTMLInputElement;
    expect(pathInput.disabled).toBe(false);
  });

  it('renders in "Edit Document" mode', () => {
    render(
      <DocumentEditorModal
        isNew={false}
        editingPath="existing/path.md"
        newPath="existing/path.md"
        editContent="Existing content"
        saving={false}
        onPathChange={() => {}}
        onContentChange={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />
    );

    expect(screen.getByText('Edit existing/path.md')).toBeInTheDocument();
    
    const pathInput = screen.getByDisplayValue('existing/path.md') as HTMLInputElement;
    expect(pathInput.disabled).toBe(true);
  });

  it('calls handlers correctly', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const onContentChange = vi.fn();
    const onPathChange = vi.fn();

    render(
      <DocumentEditorModal
        isNew={true}
        editingPath=""
        newPath="test.md"
        editContent="Content"
        saving={false}
        onPathChange={onPathChange}
        onContentChange={onContentChange}
        onSave={onSave}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Save'));
    expect(onSave).toHaveBeenCalled();

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();

    fireEvent.change(screen.getByDisplayValue('Content'), { target: { value: 'New Content' } });
    expect(onContentChange).toHaveBeenCalledWith('New Content');

    fireEvent.change(screen.getByDisplayValue('test.md'), { target: { value: 'test2.md' } });
    expect(onPathChange).toHaveBeenCalledWith('test2.md');
  });
});
