import { useState, useEffect, useCallback } from 'react'
import { listFiles, listSkills } from '../api'
import type { FileNode } from '../types'

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileNode[]>([])
  const [skills, setSkills] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchFiles = useCallback(async () => {
    try {
      const [filesData, skillsData] = await Promise.all([
        listFiles(),
        listSkills()
      ])
      setFiles(filesData)
      setSkills(skillsData)
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  return (
    <div className="page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>File Manager</h1>
          <p>Sovereign storage ~/.agent/files/</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => { setLoading(true); void fetchFiles(); }}>Refresh</button>
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      <div className="health-log">
        <h2 style={{ fontSize: 16, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Sovereign Files (~/.agent/files/)</h2>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>Name</th>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>Size</th>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>Modified</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3}><div className="skeleton" style={{ height: 20, margin: '8px 0' }}/></td></tr>
            ) : files.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>Directory is empty</td></tr>
            ) : (
              files.map(f => (
                <tr key={f.name}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {f.isDirectory ? '📁 ' : '📄 '}{f.name}
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {f.isDirectory ? '-' : formatBytes(f.size)}
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {new Date(f.modified).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <h2 style={{ fontSize: 16, marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>Agent Skills (~/.agent/skills/)</h2>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>Name</th>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>Size</th>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>Modified</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={3}><div className="skeleton" style={{ height: 20, margin: '8px 0' }}/></td></tr>
            ) : skills.length === 0 ? (
              <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>No skills found</td></tr>
            ) : (
              skills.map(f => (
                <tr key={f.name}>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {f.isDirectory ? '🧩 ' : '📄 '}{f.name}
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {f.isDirectory ? '-' : formatBytes(f.size)}
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                    {new Date(f.modified).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
