import React, { useState, useEffect } from 'react';
import { fetchDesignDocs, fetchDesignDocContent } from '../api';

// ─── Types ──────────────────────────────────────────────────────────────────────

interface DocItem {
  name: string;
  path: string;
  icon: string;
  category: string;
}

interface KanbanCard {
  id: string;
  name: string;
  emoji: string;
}

interface KanbanColumn {
  id: string;
  title: string;
  accent: string;
  cards: KanbanCard[];
  count?: number;
  collapsible?: boolean;
}

// ─── Static Data ────────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: 'in-progress',
    title: 'In Progress',
    accent: '#3b82f6',
    cards: [
      { id: 'auto-update', name: 'Auto Update Feature', emoji: '🔄' },
      { id: 'compaction-cache', name: 'Compaction Cache Bypass', emoji: '⚡' },
      { id: 'memory-policy', name: 'Memory Policy Enforcement', emoji: '🛡️' },
    ],
  },
  {
    id: 'planned',
    title: 'Planned',
    accent: '#74b9ff',
    cards: [
      { id: 'system-resilience', name: 'System Resilience', emoji: '🧱' },
      { id: 'gpu-intelligence', name: 'GPU Intelligence Network', emoji: '🧠' },
      { id: 'living-memory', name: 'Living Memory Capsule (UltraChat)', emoji: '💊' },
      { id: 'expo-mobile', name: 'Expo Mobile (stub)', emoji: '📱' },
    ],
  },
  {
    id: 'completed',
    title: 'Completed',
    accent: '#00cec9',
    count: 35,
    collapsible: true,
    cards: [
      { id: 'okf-integration', name: 'OKF Integration', emoji: '✅' },
      { id: 'byom-architecture', name: 'BYOM Architecture', emoji: '✅' },
      { id: 'cli-performance', name: 'CLI Performance Optimization', emoji: '✅' },
      { id: 'ssss-portable-memory', name: 'SSSS Portable Memory', emoji: '✅' },
      { id: 'embedding-pipeline', name: 'Embedding Pipeline v2', emoji: '✅' },
      { id: 'surface-compiler', name: 'Surface Compiler', emoji: '✅' },
    ],
  },
  {
    id: 'archived',
    title: 'Archived',
    accent: '#636e72',
    count: 3,
    collapsible: true,
    cards: [
      { id: 'legacy-sync', name: 'Legacy Sync Protocol', emoji: '📦' },
      { id: 'deprecated-cli', name: 'Deprecated CLI v1', emoji: '📦' },
      { id: 'old-auth', name: 'Old Auth Flow', emoji: '📦' },
    ],
  },
];

// ─── Simple Markdown Renderer ───────────────────────────────────────────────────

function renderMarkdown(md: string): React.ReactNode {
  if (!md) return <></>;

  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Tables (basic pipe tables) — process before other inline transforms
  html = html.replace(
    /^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _separator: string, bodyRows: string) => {
      const headers = headerRow.split('|').filter((c: string) => c.trim());
      const rows = bodyRows.trim().split('\n').map((r: string) =>
        r.split('|').filter((c: string) => c.trim())
      );
      const thCells = headers.map((h: string) =>
        `<th style="padding:8px 12px;text-align:left;border-bottom:2px solid var(--border-hover);font-weight:600;">${h.trim()}</th>`
      ).join('');
      const tbodyRows = rows.map((row: string[]) => {
        const cells = row.map((c: string) =>
          `<td style="padding:8px 12px;border-bottom:1px solid var(--border);">${c.trim()}</td>`
        ).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;"><thead><tr>${thCells}</tr></thead><tbody>${tbodyRows}</tbody></table>`;
    }
  );

  // Headings
  html = html.replace(/^#### (.*$)/gm, '<h4 style="margin:20px 0 8px;font-size:14px;color:var(--text-primary);">$1</h4>');
  html = html.replace(/^### (.*$)/gm, '<h3 style="margin:24px 0 10px;font-size:16px;color:var(--text-primary);">$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2 style="margin:28px 0 12px;font-size:19px;color:var(--text-primary);border-bottom:1px solid var(--border);padding-bottom:8px;">$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1 style="margin:0 0 16px;font-size:24px;color:var(--text-primary);">$1</h1>');

  // Code blocks (fenced)
  html = html.replace(
    /```[\w]*\n([\s\S]*?)```/g,
    '<pre style="background:rgba(0,0,0,0.35);padding:14px 16px;border-radius:var(--radius-sm);border:1px solid var(--border);font-family:var(--font-mono);font-size:12.5px;overflow-x:auto;margin:12px 0;line-height:1.5;"><code>$1</code></pre>'
  );

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--text-primary);">$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:rgba(108,92,231,0.12);color:#b8b0f0;padding:2px 6px;border-radius:4px;font-family:var(--font-mono);font-size:12px;">$1</code>'
  );

  // Blockquotes
  html = html.replace(
    /^&gt; (.*$)/gm,
    '<blockquote style="border-left:3px solid var(--accent);padding:8px 14px;color:var(--text-secondary);margin:12px 0;background:rgba(108,92,231,0.05);border-radius:0 var(--radius-sm) var(--radius-sm) 0;">$1</blockquote>'
  );

  // Unordered lists
  html = html.replace(
    /^- (.*$)/gm,
    '<li style="margin-left:20px;list-style-type:disc;margin-bottom:4px;">$1</li>'
  );

  // Ordered lists
  html = html.replace(
    /^\d+\. (.*$)/gm,
    '<li style="margin-left:20px;list-style-type:decimal;margin-bottom:4px;">$1</li>'
  );

  // Line breaks
  html = html.replace(/\n/g, '<br />');

  return <div dangerouslySetInnerHTML={{ __html: html }} className="markdown-preview-block" />;
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function DesignDocsPage() {
  const [activeTab, setActiveTab] = useState<'architecture' | 'board'>('architecture');

  // Architecture docs state
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [docContent, setDocContent] = useState<string>('');
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [docsFromApi, setDocsFromApi] = useState<DocItem[]>([]);

  // Kanban state
  const [expandedColumns, setExpandedColumns] = useState<Record<string, boolean>>({});

  // Load docs list on mount
  useEffect(() => {
    async function loadDocsList() {
      try {
        const data = await fetchDesignDocs();
        const docItems: DocItem[] = data.map(d => ({
          name: d.name,
          path: d.path,
          category: d.category || 'Other',
          icon: '📄',
        }));
        setDocsFromApi(docItems);
        if (docItems.length > 0) {
          setSelectedDoc(docItems[0]);
        }
      } catch {
        // Silently fall back
      }
    }
    loadDocsList();
  }, []);

  // Load selected doc content
  useEffect(() => {
    if (activeTab !== 'architecture' || !selectedDoc) return;
    let cancelled = false;

    async function loadContent() {
      setDocLoading(true);
      setDocError(null);
      try {
        const data = await fetchDesignDocContent(selectedDoc!.path);
        if (!cancelled) setDocContent(data.content);
      } catch {
        if (!cancelled) {
          setDocError(selectedDoc!.path);
          setDocContent('');
        }
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    }
    loadContent();
    return () => { cancelled = true; };
  }, [selectedDoc, activeTab]);

  const toggleColumn = (colId: string) => {
    setExpandedColumns(prev => ({ ...prev, [colId]: !prev[colId] }));
  };

  // ─── Sidebar Section Renderer ───────────────────────────────────────────────

  const renderSidebarSection = (title: string, items: DocItem[]) => (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-tertiary)',
          padding: '0 12px',
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {items.map(item => {
        const isActive = selectedDoc?.path === item.path;
        return (
          <button
            id={`doc-nav-${item.name.replace(/\./g, '-').toLowerCase()}`}
            key={item.path}
            onClick={() => setSelectedDoc(item)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              textAlign: 'left',
              padding: '9px 12px',
              borderRadius: 'var(--radius-sm)',
              background: isActive ? 'var(--accent-muted)' : 'transparent',
              color: isActive ? 'var(--accent-hover)' : 'var(--text-secondary)',
              border: 'none',
              cursor: 'pointer',
              transition: 'var(--transition-normal)',
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
            }}
          >
            <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.name}
            </span>
          </button>
        );
      })}
    </div>
  );

  // ─── Architecture Tab ───────────────────────────────────────────────────────

  const renderArchitectureTab = () => (
    <div
      id="architecture-panel"
      style={{ display: 'flex', gap: 24, minHeight: '65vh' }}
    >
      {/* Sidebar */}
      <div
        id="docs-sidebar"
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 8px',
          overflowY: 'auto',
        }}
      >
        {Object.entries(
          docsFromApi.reduce((acc, doc) => {
            acc[doc.category] = acc[doc.category] || [];
            acc[doc.category].push(doc);
            return acc;
          }, {} as Record<string, DocItem[]>)
        ).map(([category, items]) => (
          <React.Fragment key={category}>
            {renderSidebarSection(category, items)}
          </React.Fragment>
        ))}
      </div>

      {/* Main Viewer */}
      <div
        id="docs-viewer"
        style={{
          flex: 1,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          padding: '24px 32px',
          overflowY: 'auto',
          maxHeight: '75vh',
        }}
      >
        {/* Breadcrumb */}
        <div
          id="docs-breadcrumb"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            color: 'var(--text-tertiary)',
            marginBottom: 20,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>Total Recall</span>
          <span style={{ color: 'var(--text-tertiary)' }}>›</span>
          <span>docs</span>
          <span style={{ color: 'var(--text-tertiary)' }}>›</span>
          <span style={{ color: 'var(--accent)' }}>{selectedDoc?.name}</span>
        </div>

        {/* Content */}
        {docLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[200, 120, 280, 80, 160].map((w, i) => (
              <div
                key={i}
                className="skeleton"
                style={{ height: 16, width: `${w}px`, maxWidth: '100%', borderRadius: 4 }}
              />
            ))}
          </div>
        ) : docError ? (
          <div
            id="doc-fallback-message"
            style={{
              background: 'var(--warning-muted)',
              border: '1px solid rgba(253, 203, 110, 0.2)',
              borderRadius: 'var(--radius-sm)',
              padding: '20px 24px',
              color: 'var(--text-secondary)',
              lineHeight: 1.7,
            }}
          >
            <div style={{ marginBottom: 8, color: 'var(--warning)', fontWeight: 600 }}>
              📄 Document not available via API
            </div>
            <div>
              This document is available in your project at{' '}
              <code
                style={{
                  background: 'rgba(108,92,231,0.12)',
                  color: '#b8b0f0',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              >
                {docError}
              </code>
              . Open it in your editor to view.
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--text-primary)', lineHeight: 1.75, fontSize: 14 }}>
            {renderMarkdown(docContent)}
          </div>
        )}
      </div>
    </div>
  );

  // ─── Kanban Board Tab ─────────────────────────────────────────────────────────

  const renderKanbanCard = (card: KanbanCard) => (
    <div
      id={`kanban-card-${card.id}`}
      key={card.id}
      style={{
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        padding: '12px 14px',
        cursor: 'default',
        transition: 'var(--transition-normal)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
        (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
      }}
    >
      <span style={{ fontSize: 16, flexShrink: 0 }}>{card.emoji}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
        {card.name}
      </span>
    </div>
  );

  const renderKanbanColumn = (col: KanbanColumn) => {
    const isExpanded = expandedColumns[col.id] ?? !col.collapsible;
    const visibleCards = isExpanded ? col.cards : [];

    return (
      <div
        id={`kanban-col-${col.id}`}
        key={col.id}
        style={{
          minWidth: 260,
          flex: 1,
          maxWidth: 320,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          borderTop: `4px solid ${col.accent}`,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Column Header */}
        <div
          style={{
            padding: '14px 16px 10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-primary)' }}>
              {col.title}
            </span>
            <span
              className="badge"
              style={{
                background: `${col.accent}22`,
                color: col.accent,
                fontSize: 11,
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              {col.count ?? col.cards.length}
            </span>
          </div>
          {col.collapsible && (
            <button
              id={`kanban-toggle-${col.id}`}
              className="btn btn-ghost"
              onClick={() => toggleColumn(col.id)}
              style={{
                fontSize: 12,
                padding: '4px 10px',
                color: 'var(--text-secondary)',
                background: 'transparent',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          )}
        </div>

        {/* Cards */}
        <div
          style={{
            padding: '0 12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            flex: 1,
          }}
        >
          {col.collapsible && !isExpanded ? (
            <div
              style={{
                color: 'var(--text-tertiary)',
                fontSize: 12,
                textAlign: 'center',
                padding: '12px 0',
                cursor: 'pointer',
              }}
              onClick={() => toggleColumn(col.id)}
            >
              {col.count ?? col.cards.length} projects — click to expand
            </div>
          ) : (
            visibleCards.map(card => renderKanbanCard(card))
          )}
        </div>
      </div>
    );
  };

  const renderBoardTab = () => (
    <div id="board-panel">
      <div
        id="kanban-board"
        style={{
          display: 'flex',
          gap: 16,
          overflowX: 'auto',
          paddingBottom: 16,
        }}
      >
        {KANBAN_COLUMNS.map(col => renderKanbanColumn(col))}
      </div>
    </div>
  );

  // ─── Main Render ──────────────────────────────────────────────────────────────

  const tabs: { key: typeof activeTab; label: string; icon: string }[] = [
    { key: 'architecture', label: 'Architecture', icon: '📐' },
    { key: 'board', label: 'Project Board', icon: '📋' },
  ];

  return (
    <div className="page" style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Page Header */}
      <div className="page-header" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Design Docs & Projects</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
          Architecture documentation, specifications, and project tracking board.
        </p>
      </div>

      {/* Tab Navigation */}
      <div
        id="design-docs-tabs"
        style={{
          display: 'inline-flex',
          gap: 0,
          marginBottom: 24,
          borderBottom: '1px solid var(--border)',
        }}
      >
        {tabs.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              id={`tab-${tab.key}`}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 20px',
                background: 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 14,
                fontWeight: isActive ? 600 : 400,
                borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'var(--transition-normal)',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'architecture' ? renderArchitectureTab() : renderBoardTab()}

      {/* ─── Responsive Styles ─────────────────────────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          #architecture-panel {
            flex-direction: column !important;
          }
          #docs-sidebar {
            width: 100% !important;
            max-height: 200px;
          }
          #kanban-board {
            flex-direction: column !important;
          }
          #kanban-board > div {
            max-width: 100% !important;
            min-width: 100% !important;
          }
        }
      `}</style>
    </div>
  );
}
