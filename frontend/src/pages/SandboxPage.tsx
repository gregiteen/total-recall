import { useState, useEffect } from 'react'
import { runSandbox, fetchConfig, saveConfig } from '../api'

const DEFAULT_CODE = `// Total Recall Sandbox — JavaScript
// Code runs in an isolated Node.js process.

const result = Array.from({ length: 5 }, (_, i) => ({
  index: i,
  fibonacci: fib(i),
}));

function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

console.log(JSON.stringify(result, null, 2));
`

export default function SandboxPage() {
  const [fileMode, setFileMode] = useState<'script.mjs' | 'DESIGN.md'>('script.mjs')
  const [code, setCode] = useState(DEFAULT_CODE)
  const [designCode, setDesignCode] = useState('# Design System\n\nPreview your markdown here.')
  const [output, setOutput] = useState('')
  const [isError, setIsError] = useState(false)
  const [running, setRunning] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    fetchConfig('DESIGN.md').then(setDesignCode).catch(() => {})
  }, [])

  const handleRun = async () => {
    if (fileMode === 'DESIGN.md') {
      try {
        await saveConfig('DESIGN.md', designCode)
        setOutput('DESIGN.md saved successfully.')
        setIsError(false)
      } catch (e) {
        setOutput((e as Error).message)
        setIsError(true)
      }
      return
    }

    setRunning(true)
    setOutput('')
    try {
      const result = await runSandbox(code)
      setOutput(result.output)
      setIsError(!result.success)
    } catch (e) {
      setOutput((e as Error).message)
      setIsError(true)
    } finally {
      setRunning(false)
    }
  }

  const toggleChat = () => {
    window.dispatchEvent(new CustomEvent('toggle-floating-chat'))
  }

  const containerStyle: React.CSSProperties = isFullscreen ? {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9000, background: 'var(--bg-primary)'
  } : {}

  return (
    <div className="page" style={containerStyle}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Code Sandbox & Design</h1>
          <p>Execute JavaScript or edit Design System</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={toggleChat}>💬 Float Agent</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
        </div>
      </div>
      <div className="sandbox-layout">
        <div className="sandbox-editor">
          <div className="sandbox-editor-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <select 
              value={fileMode} 
              onChange={e => setFileMode(e.target.value as any)}
              style={{ background: 'transparent', color: 'white', border: 'none', outline: 'none', fontWeight: 600 }}
            >
              <option value="script.mjs">script.mjs</option>
              <option value="DESIGN.md">DESIGN.md</option>
            </select>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{fileMode === 'DESIGN.md' ? 'Markdown' : 'JavaScript'}</span>
          </div>
          <textarea
            id="sandbox-editor"
            value={fileMode === 'DESIGN.md' ? designCode : code}
            onChange={e => fileMode === 'DESIGN.md' ? setDesignCode(e.target.value) : setCode(e.target.value)}
            spellCheck={false}
          />
        </div>
        <div className="sandbox-toolbar">
          <button className="btn btn-primary" onClick={handleRun} disabled={running} id="sandbox-run">
            {fileMode === 'DESIGN.md' ? '💾 Save Design' : (running ? '⏳ Running…' : '▶ Run Code')}
          </button>
        </div>
        <div className={`sandbox-output ${isError ? 'error' : ''}`} id="sandbox-output">
          {output || (fileMode === 'DESIGN.md' ? '// Output saved to ~/.agent/config/DESIGN.md' : '// Output will appear here after execution')}
        </div>
      </div>
    </div>
  )
}
