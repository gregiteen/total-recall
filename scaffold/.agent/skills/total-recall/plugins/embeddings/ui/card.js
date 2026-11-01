/**
 * Vector Space — On-Device Semantic Coverage & Vector Engine Console
 *
 * Bespoke operator interface for local vector embeddings and vault coverage.
 * Displays real-time circular SVG coverage gauge, local model roster, vector
 * dimensions, and benchmark latency meters with zero template wrappers or terminal dumps.
 */

const DASH = '\u2014';

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

export class EmbeddingsCard extends HTMLElement {
  constructor() {
    super();
    this.coverage = null;
    this.models = [];
    this.benchmark = null;
    this.selectedModel = 'nomic-embed-text';
    this.executing = false;
    this.screens = [{ id: 'coverage', label: 'Vector Coverage' }];
    this.screen = 'coverage';
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.refreshTelemetry();
  }

  async refreshTelemetry() {
    if (!this.host) return;
    try {
      // 1. Fetch coverage
      const covRes = await this.host.run('coverage', ['--json']);
      if (covRes && typeof covRes === 'object') {
        this.coverage = covRes;
      } else if (typeof covRes === 'string' && covRes.trim().startsWith('{')) {
        this.coverage = JSON.parse(covRes);
      }

      // 2. Fetch models
      try {
        const modRes = await this.host.run('models', ['--json']);
        if (Array.isArray(modRes)) this.models = modRes;
        else if (modRes && Array.isArray(modRes.models)) this.models = modRes.models;
      } catch {
        this.models = [];
      }

      this.render();
    } catch {
      this.coverage = null;
      this.render();
    }
  }

  async runBenchmark() {
    if (!this.host || this.executing) return;
    this.executing = true;
    this.render();
    try {
      const res = await this.host.run('benchmark', ['--json']);
      if (res && typeof res === 'object') {
        this.benchmark = res;
      } else if (typeof res === 'string' && res.trim().startsWith('{')) {
        this.benchmark = JSON.parse(res);
      }
    } catch {
      this.benchmark = null;
    } finally {
      this.executing = false;
      this.render();
    }
  }

  render() {
    const root = this.shadowRoot;
    if (!root) return;

    const cov = this.coverage;
    const rawPct = cov?.percentage !== undefined ? Number(cov.percentage) : null;
    const pct = rawPct !== null && !isNaN(rawPct) ? Math.min(100, Math.max(0, Math.round(rawPct))) : null;

    // SVG arc stroke dash calculation
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = pct !== null ? circumference - (pct / 100) * circumference : circumference;

    const embeddedNodes = cov?.embeddedNodes !== undefined ? cov.embeddedNodes : (cov?.embedded || DASH);
    const totalNodes = cov?.totalNodes !== undefined ? cov.totalNodes : (cov?.total || DASH);
    const activeModel = cov?.model || this.selectedModel;
    const dimensions = cov?.dimensions || 768;

    root.innerHTML = `
      <style>
        :host {
          --face-bg: #07171d;
          --face-surface: #0e2a35;
          --face-line: #164e63;
          --face-text: #ecfeff;
          --face-muted: #67e8f9;
          --face-brand: #06b6d4;
          --face-brand-hover: #22d3ee;
          --face-accent: #22d3ee;
          --face-ok: #10b981;
          --face-warn: #f59e0b;
          --face-danger: #ef4444;
          --face-dark: #07171d;

          display: block;
          font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          color: var(--text-primary, var(--face-text));
          background: var(--bg-secondary, var(--face-bg));
          border: 1px solid var(--border, var(--face-line));
          border-radius: 8px;
          padding: 16px;
          box-sizing: border-box;
          overflow: hidden;
        }

        @media (prefers-reduced-motion: reduce) {
          *, ::before, ::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        /* Header Bar */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--border, var(--face-line));
          margin-bottom: 16px;
        }

        .brand-group {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .wordmark-badge {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: var(--card-accent, var(--face-brand));
          background: rgba(6, 182, 212, 0.12);
          padding: 6px 10px;
          border-radius: 6px;
          border: 1px solid rgba(6, 182, 212, 0.3);
        }

        .title-meta {
          display: flex;
          flex-direction: column;
        }

        .plugin-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
          margin: 0;
        }

        .plugin-subtitle {
          font-size: 11px;
          color: var(--text-secondary, var(--face-muted));
          margin: 0;
        }

        .locality-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          font-weight: 700;
          color: var(--face-ok);
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          padding: 5px 12px;
          border-radius: 6px;
          text-transform: uppercase;
        }

        /* Main Console Grid */
        .console-grid {
          display: grid;
          grid-template-columns: minmax(200px, 1fr) minmax(280px, 1.8fr);
          gap: 14px;
          margin-bottom: 16px;
        }

        @media (max-width: 680px) {
          .console-grid {
            grid-template-columns: 1fr;
          }
        }

        /* Coverage Gauge Column */
        .gauge-card {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(14, 42, 53, 0.4);
          padding: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          text-align: center;
        }

        .svg-container {
          position: relative;
          width: 96px;
          height: 96px;
        }

        .gauge-svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }

        .gauge-bg {
          fill: none;
          stroke: rgba(22, 78, 99, 0.6);
          stroke-width: 8;
        }

        .gauge-fill {
          fill: none;
          stroke: var(--face-brand);
          stroke-width: 8;
          stroke-linecap: round;
          stroke-dasharray: ${circumference};
          stroke-dashoffset: ${offset};
          transition: stroke-dashoffset 0.4s ease;
        }

        .gauge-inner-text {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }

        .gauge-number {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 18px;
          font-weight: 800;
          color: var(--text-primary, var(--face-text));
        }

        .gauge-label {
          font-size: 9px;
          text-transform: uppercase;
          color: var(--text-secondary, var(--face-muted));
          letter-spacing: 0.05em;
        }

        .gauge-stats {
          font-size: 11px;
          color: var(--text-secondary, var(--face-muted));
        }

        .gauge-stats strong {
          color: var(--text-primary, var(--face-text));
        }

        /* Model & Benchmark Panel */
        .details-deck {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .deck-box {
          border: 1px solid var(--border, var(--face-line));
          border-radius: 6px;
          background: rgba(14, 42, 53, 0.4);
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .deck-title {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-secondary, var(--face-muted));
          margin: 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .model-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 8px 10px;
          background: rgba(7, 23, 29, 0.6);
          border: 1px solid var(--border, var(--face-line));
          border-radius: 5px;
        }

        .model-name {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 12px;
          font-weight: 700;
          color: var(--text-primary, var(--face-text));
        }

        .model-badges {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .dim-chip {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          background: rgba(6, 182, 212, 0.15);
          color: var(--face-accent);
        }

        /* Benchmark Trigger */
        .benchmark-action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }

        .btn-benchmark {
          min-height: 44px;
          padding: 8px 16px;
          font-family: var(--font-sans, sans-serif);
          font-size: 12px;
          font-weight: 700;
          color: var(--face-dark);
          background: var(--face-brand);
          border: none;
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .btn-benchmark:hover {
          background: var(--face-brand-hover);
        }

        .btn-benchmark:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .bench-result {
          font-family: var(--font-mono, 'JetBrains Mono', monospace);
          font-size: 11px;
          color: var(--face-ok);
        }

        /* Footer Telemetry */
        .footer-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          margin-top: 14px;
          border-top: 1px solid var(--border, var(--face-line));
          font-size: 10px;
          color: var(--text-secondary, var(--face-muted));
        }
      </style>

      <div class="header">
        <div class="brand-group">
          <div class="wordmark-badge">[VECTOR//SPACE]</div>
          <div class="title-meta">
            <h3 class="plugin-title">Vector Space & Coverage</h3>
            <p class="plugin-subtitle">On-device semantic memory coverage and local model runner</p>
          </div>
        </div>
        <div class="locality-chip">
          Strict Local Engine
        </div>
      </div>

      <div class="console-grid">
        <div class="gauge-card">
          <div class="svg-container">
            <svg class="gauge-svg" viewBox="0 0 96 96">
              <circle class="gauge-bg" cx="48" cy="48" r="${radius}" />
              <circle class="gauge-fill" cx="48" cy="48" r="${radius}" />
            </svg>
            <div class="gauge-inner-text">
              <span class="gauge-number">${pct !== null ? `${pct}%` : DASH}</span>
              <span class="gauge-label">Vault</span>
            </div>
          </div>
          <div class="gauge-stats">
            <div>Embedded: <strong>${embeddedNodes}</strong> / <strong>${totalNodes}</strong></div>
            <div>Storage: <strong>SQLite (embeddings.db)</strong></div>
          </div>
        </div>

        <div class="details-deck">
          <div class="deck-box">
            <div class="deck-title">
              <span>Active Model Weights</span>
              <span class="dim-chip">${dimensions} dimensions</span>
            </div>
            <div class="model-row">
              <span class="model-name">${escapeHtml(activeModel)}</span>
              <div class="model-badges">
                <span class="dim-chip">On-Device GGUF</span>
                <span class="dim-chip" style="color: var(--face-ok);">Ready</span>
              </div>
            </div>
          </div>

          <div class="deck-box">
            <div class="deck-title">Projection Benchmark</div>
            <div class="benchmark-action-row">
              <button class="btn-benchmark" type="button" id="btn-bench" ${this.executing ? 'disabled' : ''}>
                ${this.executing ? 'Benchmarking...' : 'Test Projection Speed'}
              </button>
              <div class="bench-result">
                ${this.benchmark ? `Latency: ${this.benchmark.latency_ms || this.benchmark.ms || DASH}ms per chunk` : 'Click to measure latency'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="footer-bar">
        <span>Model: ${escapeHtml(activeModel)}</span>
        <span>Locality Invariant: Strictly On-Device</span>
      </div>
    `;

    // Event listeners
    root.querySelector('#btn-bench')?.addEventListener('click', () => this.runBenchmark());
  }
}

if (!customElements.get('tr-embeddings-card')) {
  customElements.define('tr-embeddings-card', EmbeddingsCard);
}
