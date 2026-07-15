import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const helpContent: Record<string, string> = {
  '/': `### Chat Interface\nWelcome to the interactive chat interface. Here you can talk directly to your active agent. Use \`/skills\` to invoke specialized tools.`,
  '/memory': `### Memory Vault\nThis page displays your active SSSS (Structured Semantic Syntax System) memory nodes. These nodes dynamically rebuild the prompt instructions injected into your IDEs.`,
  '/graph': `### Concept Graph\nVisualize the semantic relationships between all of your nodes and architectural decisions across the entire workspace.`,
  '/tasks': `### Background Tasks\nManage and review long-running background tasks (like the Dream Cycle or asynchronous Research operations).`,
  '/integrations': `### IDE Integrations\nConfigure your IDE mappings. Any changes here will write the appropriate markdown files (e.g., \`.cursorrules\`, \`CLAUDE.md\`) directly into your repository.`,
  '/skills': `### Agent Skills\nReview your currently active skills. Skills provide the underlying tooling capability to your autonomous agent.`,
  '/openwiki': `### OpenWiki\nExplore auto-generated architectural diagrams and knowledge base documents inferred directly from your project codebase.`,
  '/keys': `### Keys & Usage\nConfigure your API keys (Anthropic, Google, OpenAI, etc.) and view your realtime USD token expenditures based on the \`budget.yml\` constraints.`,
  '/settings': `### Global Settings\nConfigure the daemon behavior, Sandbox enforcement, network bindings, and overarching agent execution priorities.`,
  '/help': `### Help Center\nDetailed documentation regarding the CLI architecture, SSSS definitions, and internal mechanisms.`,
  '/onboarding': `### Setup Guide\nThe primary deployment scaffolding tool. Select your target environment and initialize the memory database.`
};

export default function ContextualHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const [content, setContent] = useState('');

  useEffect(() => {
    // Determine content based on current path
    const path = location.pathname;
    setContent(helpContent[path] || `### ${path}\nNo specific documentation is available for this route yet.`);
  }, [location.pathname]);

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '48px',
          height: '48px',
          borderRadius: '24px',
          backgroundColor: 'var(--accent-primary, #6366f1)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          zIndex: 9998,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '24px',
          fontWeight: 'bold'
        }}
        title="Page Help"
      >
        ?
      </button>

      {isOpen && (
        <div 
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => setIsOpen(false)}
        >
          <div 
            style={{
              width: '500px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              backgroundColor: 'var(--bg-primary, #1e1e1e)',
              color: 'var(--text-primary, #e5e5e5)',
              padding: '2rem',
              borderRadius: '12px',
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
              lineHeight: 1.6
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setIsOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-secondary, #a3a3a3)',
                  cursor: 'pointer',
                  fontSize: '18px'
                }}
              >
                ✕
              </button>
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {content}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
