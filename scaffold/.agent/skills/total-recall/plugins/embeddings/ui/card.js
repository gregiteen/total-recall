/**
 * ui/card.js — Embeddings Vector Engine Card Face
 *
 * Bespoke Animated Web Component Card Face with Vector Dimensional Scatter Visualizer,
 * Ollama Local/Mesh Provider Telemetry, Benchmark Runner, and Vault Coverage Inspector.
 */

export class EmbeddingsCard extends HTMLElement {
  constructor() {
    super();
    this.status = 'Ready';
    this.coverage = '98%';
    this.provider = 'Ollama (Local/Mesh)';
    this.model = 'nomic-embed-text';
    this.executing = false;
  }

  connectedCallback() {
    if (!this.shadowRoot) {
      this.attachShadow({ mode: 'open' });
    }
    this.render();
    this.initVectorScatterAnimation();
  }

  async execute(action, args = []) {
    const out = this.shadowRoot.querySelector('#card-out');
    const statusBadge = this.shadowRoot.querySelector('#status-badge');
    if (out) out.textContent = `[EMBEDDINGS ENGINE] Running ${action.toUpperCase()}...`;
    if (statusBadge) statusBadge.textContent = 'RUNNING';
    this.executing = true;

    try {
      let res;
      if (this.host && typeof this.host.run === 'function') {
        res = await this.host.run(action, args);
      } else {
        res = `Executed total-recall embeddings ${action} ${args.join(' ')}`;
      }

      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res || 'Operation completed without output.');
      }
      if (out) out.textContent = text.trim();
      if (statusBadge) statusBadge.textContent = 'READY';
    } catch (err) {
      if (out) out.textContent = `[ERROR] ${err.message}`;
      if (statusBadge) statusBadge.textContent = 'ERROR';
    } finally {
      this.executing = false;
    }
  }

  initVectorScatterAnimation() {
    const canvas = this.shadowRoot.querySelector('#vector-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Generate fixed dimensional nodes
    const nodes = [];
    for (let i = 0; i < 48; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        radius: 1.5 + Math.random() * 2
      });
    }

    const draw = () => {
      if (!this.isConnected) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;

      // Coordinate grid
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y < h; y += 16) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();

      // Vector edges
      ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 42) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      // Vector point scatter
      ctx.fillStyle = '#10b981';
      for (const node of nodes) {
        node.x += node.vx;
        node.y += node.vy;
        if (node.x < 0 || node.x > w) node.vx *= -1;
        if (node.y < 0 || node.y > h) node.vy *= -1;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(draw);
    };

    draw();
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--color-surface, #0f172a);
          color: var(--color-text, #f8fafc);
          border: 1px solid var(--color-border, #334155);
          border-radius: var(--radius-md, 12px);
          padding: 18px;
          box-sizing: border-box;
          max-width: 440px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 14px;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .brand-icon {
          width: 22px;
          height: 22px;
          color: #10b981;
        }

        .title {
          font-size: 15px;
          font-weight: 700;
          color: #f1f5f9;
        }

        .badge-pill {
          font-size: 11px;
          color: #34d399;
          background: rgba(16, 185, 129, 0.15);
          padding: 2px 7px;
          border-radius: 6px;
          font-weight: 600;
        }

        .status-pill {
          font-size: 11px;
          text-transform: uppercase;
          font-weight: 700;
          padding: 3px 8px;
          border-radius: 9999px;
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
        }

        .canvas-container {
          background: rgba(15, 23, 42, 0.6);
          border: 1px solid #1e293b;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 14px;
        }

        canvas {
          display: block;
          width: 100%;
          height: 64px;
        }

        .telemetry-row {
          display: flex;
          justify-content: space-between;
          padding: 6px 10px;
          font-size: 11px;
          color: #94a3b8;
          border-top: 1px solid #1e293b;
        }

        .actions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }

        .touch-btn {
          min-height: 44px;
          background: #1e293b;
          border: 1px solid #334155;
          border-radius: 8px;
          color: #cbd5e1;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .touch-btn:hover {
          background: #10b981;
          border-color: #10b981;
          color: #ffffff;
        }

        .output-box {
          background: #020617;
          border: 1px solid #1e293b;
          border-radius: 6px;
          padding: 10px;
          font-family: ui-monospace, Menlo, monospace;
          font-size: 11px;
          color: #34d399;
          min-height: 52px;
          max-height: 120px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-all;
        }
      </style>

      <div class="header">
        <div class="brand-badge">
          <svg class="brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
          <span class="title">Embeddings</span>
          <span class="badge-pill">768 Dim</span>
        </div>
        <span id="status-badge" class="status-pill">Ready</span>
      </div>

      <div class="canvas-container">
        <canvas id="vector-canvas" width="400" height="64"></canvas>
        <div class="telemetry-row">
          <span>Provider: Ollama (Zero-Cost)</span>
          <span>Model: nomic-embed-text</span>
        </div>
      </div>

      <div class="actions-grid">
        <button id="btn-status" class="touch-btn" type="button">Status</button>
        <button id="btn-coverage" class="touch-btn" type="button">Coverage</button>
        <button id="btn-benchmark" class="touch-btn" type="button">Benchmark</button>
      </div>

      <div id="card-out" class="output-box">Ollama vector engine active. 768-dimension local embeddings ready.</div>
    `;

    this.shadowRoot.querySelector('#btn-status')?.addEventListener('click', () => {
      this.execute('status');
    });

    this.shadowRoot.querySelector('#btn-coverage')?.addEventListener('click', () => {
      this.execute('coverage');
    });

    this.shadowRoot.querySelector('#btn-benchmark')?.addEventListener('click', () => {
      this.execute('benchmark');
    });
  }
}

if (!customElements.get('tr-embeddings-card')) {
  customElements.define('tr-embeddings-card', EmbeddingsCard);
}
