// ─── Shared markdown rendering utilities for the Cognitive Dashboard ─────────
import { Link } from 'react-router-dom';

export function extractSources(body?: string) {
  if (!body) return [];
  const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  const sources: { text: string; url: string }[] = [];
  const urls = new Set<string>();
  let match;
  while ((match = regex.exec(body)) !== null) {
    const text = match[1];
    const url = match[2];
    if (!urls.has(url)) {
      urls.add(url);
      sources.push({ text, url });
    }
  }
  return sources;
}

export function parseInlineStyles(text: string) {
  const regex = /(\*\*.*?\*\*|`.*?`|\[\[.*?\]\])/g;
  const matches = text.split(regex);
  
  return matches.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} style={{ background: 'var(--bg-elevated)', padding: '2px 5px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#ff79c6', border: '1px solid var(--border)' }}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2);
      const pipeIdx = inner.indexOf('|');
      const slug = pipeIdx !== -1 ? inner.slice(0, pipeIdx).trim() : inner.trim();
      const display = pipeIdx !== -1 ? inner.slice(pipeIdx + 1).trim() : slug;
      
      return (
        <Link 
          key={index} 
          to={`/memory?slug=${encodeURIComponent(slug)}`} 
          style={{ 
            color: 'var(--accent)', 
            textDecoration: 'none', 
            fontWeight: 500,
            borderBottom: '1px dashed var(--accent)',
            cursor: 'pointer'
          }}
        >
          {display}
        </Link>
      );
    }
    return part;
  });
}

export function renderMarkdown(text: string) {
  if (!text) return null;
  const lines = text.split('\n');
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    
    if (trimmed.startsWith('### ')) {
      return <h5 key={idx} style={{ margin: '14px 0 6px 0', color: 'var(--success)', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{trimmed.slice(4)}</h5>;
    }
    if (trimmed.startsWith('## ')) {
      return <h4 key={idx} style={{ margin: '18px 0 8px 0', color: 'var(--accent)', fontSize: 14, fontWeight: 600 }}>{trimmed.slice(3)}</h4>;
    }
    if (trimmed.startsWith('# ')) {
      return <h3 key={idx} style={{ margin: '22px 0 10px 0', color: '#fff', fontSize: 16, fontWeight: 700 }}>{trimmed.slice(2)}</h3>;
    }
    
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      return (
        <div key={idx} style={{ display: 'flex', gap: 8, margin: '4px 0 4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--accent)', userSelect: 'none' }}>•</span>
          <span>{parseInlineStyles(trimmed.slice(2))}</span>
        </div>
      );
    }
    
    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      return (
        <div key={idx} style={{ display: 'flex', gap: 8, margin: '4px 0 4px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{numMatch[1]}.</span>
          <span>{parseInlineStyles(numMatch[2])}</span>
        </div>
      );
    }
    
    if (!trimmed) {
      return <div key={idx} style={{ height: 8 }} />;
    }
    
    return <p key={idx} style={{ margin: '6px 0', fontSize: 13, color: 'var(--text-secondary)', lineHeight: '1.6' }}>{parseInlineStyles(line)}</p>;
  });
}
