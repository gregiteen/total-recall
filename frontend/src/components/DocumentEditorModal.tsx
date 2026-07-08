// React import removed

export interface DocumentEditorModalProps {
  isNew: boolean;
  editingPath: string;
  newPath: string;
  editContent: string;
  saving: boolean;
  onPathChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function DocumentEditorModal({
  isNew,
  editingPath,
  newPath,
  editContent,
  saving,
  onPathChange,
  onContentChange,
  onSave,
  onCancel
}: DocumentEditorModalProps) {
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: '#1e1e1e', width: '90%', height: '90%', borderRadius: '8px', display: 'flex', flexDirection: 'column', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>{isNew ? 'New Document' : `Edit ${editingPath}`}</h2>
          <div>
            <button onClick={onCancel} style={{ marginRight: '10px', padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
            <button onClick={onSave} disabled={saving} style={{ padding: '8px 16px', background: '#4a90e2', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
        <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <label style={{ display: 'block', marginBottom: '5px' }}>File Path</label>
          <input 
            type="text" 
            value={newPath} 
            onChange={e => onPathChange(e.target.value)} 
            disabled={!isNew}
            style={{ width: '100%', padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'monospace' }} 
          />
        </div>
        <div style={{ flex: 1, padding: '20px', display: 'flex' }}>
          <textarea 
            value={editContent} 
            onChange={e => onContentChange(e.target.value)} 
            style={{ width: '100%', height: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'monospace', padding: '10px', resize: 'none' }}
            placeholder="---&#10;type: memory&#10;title: New Document&#10;---&#10;&#10;Content goes here..."
          />
        </div>
      </div>
    </div>
  );
}
