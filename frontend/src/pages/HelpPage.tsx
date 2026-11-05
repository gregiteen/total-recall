import { useState, useEffect } from 'react'
import { fetchHelpTopics, fetchHelpContent } from '../api'
import type { HelpTopic } from '../api'

function renderMarkdown(md: string) {
  if (!md) return ''
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

  // Bold & Italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

  // Code blocks
  html = html.replace(
    /```([\s\S]*?)```/g,
    '<pre style="background:rgba(0,0,0,0.3);padding:12px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);font-family:monospace;overflow-x:auto;margin:12px 0;"><code>$1</code></pre>'
  )
  html = html.replace(
    /`(.*?)`/g,
    '<code style="background:rgba(255,255,255,0.06);padding:2px 6px;border-radius:4px;font-family:monospace;">$1</code>'
  )

  // Blockquotes
  html = html.replace(
    /^> (.*$)/gim,
    '<blockquote style="border-left:4px solid var(--purple-primary);padding-left:14px;color:var(--text-secondary);margin:16px 0;font-style:italic;">$1</blockquote>'
  )

  // Lists
  html = html.replace(/^- (.*$)/gim, '<li style="margin-left:20px;list-style-type:disc;">$1</li>')

  // Linebreaks
  html = html.replace(/\n/g, '<br />')

  return <div dangerouslySetInnerHTML={{ __html: html }} className="markdown-preview-block" />
}

export default function HelpPage() {
  const [topics, setTopics] = useState<HelpTopic[]>([])
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  useEffect(() => {
    async function loadTopics() {
      try {
        const data = await fetchHelpTopics()
        setTopics(data.topics)
        if (data.topics.length > 0) {
          setSelectedTopic(data.topics[0].id)
        }
      } catch (err: unknown) {
        setError((err as Error).message || 'Failed to load help topics')
      }
    }
    loadTopics()
  }, [])

  useEffect(() => {
    if (!selectedTopic) return
    async function loadContent() {
      setLoading(true)
      try {
        const data = await fetchHelpContent(selectedTopic!)
        setContent(data.content)
      } catch (err: unknown) {
        setError((err as Error).message || 'Failed to load help details')
      } finally {
        setLoading(false)
      }
    }
    loadContent()
  }, [selectedTopic])

  return (
    <div className="page" style={{ padding: '24px', maxWidth: '1100px', margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: '24px' }}>
        <h1>Help & CLI Reference</h1>
        <p>Offline docs for portable memory: CLI commands, vault layout, dream, tasks, and IDE connect.</p>
      </div>

      {error && <div className="badge badge-error" style={{ marginBottom: '16px' }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '30px', minHeight: '500px' }}>
        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {topics.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelectedTopic(t.id)}
              style={{
                textAlign: 'left',
                minHeight: '44px',
                padding: '12px 16px',
                borderRadius: 'var(--radius-md, 10px)',
                background: selectedTopic === t.id ? 'var(--color-primary, #8b5cf6)' : 'rgba(12, 18, 32, 0.72)',
                color: '#fff',
                border: selectedTopic === t.id ? '1px solid var(--purple-border, #a78bfa)' : '1px solid rgba(148, 163, 184, 0.12)',
                backdropFilter: 'blur(16px)',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '14px' }}>{t.title}</div>
              <div style={{ fontSize: '12px', color: selectedTopic === t.id ? 'rgba(255, 255, 255, 0.9)' : 'var(--text-secondary)', marginTop: '4px' }}>
                {t.description}
              </div>
            </button>
          ))}
        </div>

        {/* Content Pane */}
        <div
          style={{
            background: 'rgba(12, 18, 32, 0.72)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(148, 163, 184, 0.12)',
            borderRadius: 'var(--radius-lg, 16px)',
            padding: '32px',
            overflowY: 'auto',
            maxHeight: '75vh',
          }}
        >
          {loading ? (
            <div className="skeleton" style={{ height: '400px' }} />
          ) : (
            <div className="markdown-body" style={{ color: 'var(--text-primary)', lineHeight: '1.7', fontSize: '14px' }}>
              {renderMarkdown(content)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
