/**
 * Pipeline Composer — Dynamic Command Orchestration Engine
 * Bespoke Animated Web Component Card Face with Live Flow Pipeline Visualizer.
 *
 * Zero emojis, authentic commercial brand identity, touch-first ergonomics (>=44px).
 */

export class PipelineComposerCard extends HTMLElement {
  constructor() {
    super();
    this.status = 'Ready';
    this.executing = false;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this.initPipelineAnimation();
  }

  async execute(action, args = []) {
    const out = this.shadowRoot.querySelector('#card-out');
    const badge = this.shadowRoot.querySelector('#status-badge');
    if (out) out.textContent = `[PIPELINE ROUTER] Invoking ${action.toUpperCase()}...`;
    if (badge) badge.textContent = 'ROUTING';
    this.executing = true;

    try {
      const res = await this.host?.run(action, args);
      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res || 'Execution completed without output.');
      }
      if (out) out.textContent = text.trim();
      if (badge) badge.textContent = 'ONLINE';
    } catch (err) {
      if (out) out.textContent = `[PIPELINE FAULT] ${err.message}`;
      if (badge) badge.textContent = 'ERROR';
    } finally {
      this.executing = false;
    }
  }

  initPipelineAnimation() {
    const canvas = this.shadowRoot.querySelector('#flow-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let progress = 0;
    const nodes = [
      { x: 30, y: 32, label: 'INPUT' },
      { x: 110, y: 32, label: 'TRANSFORM' },
      { x: 210, y: 32, label: 'FILTER' },
      { x: 300, y: 32, label: 'SINK' }
    ];

    const draw = () => {
      if (!this.isConnected) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connection lines
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(nodes[0].x, nodes[0].y);
      for (let i = 1; i < nodes.length; i++) {
        ctx.lineTo(nodes[i].x, nodes[i].y);
      }
      ctx.stroke();

      // Draw packet pulse
      const totalLen = nodes[nodes.length - 1].x - nodes[0].x;
      const packetX = nodes[0].x + (progress % 1) * totalLen;
      ctx.fillStyle = this.executing ? '#38bdf8' : '#818cf8';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(packetX, 32, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw stage nodes
      for (const node of nodes) {
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#c7d2fe';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y + 18);
      }

      progress += this.executing ? 0.03 : 0.008;
      requestAnimationFrame(draw);
    };

    requestAnimationFrame(draw);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #0b0f19;
          color: #e0e7ff;
          border-radius: 8px;
          border: 1px solid rgba(99, 102, 241, 0.35);
          box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
          padding: 18px;
          box-sizing: border-box;
          overflow: hidden;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .brand-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .title {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #c7d2fe;
          margin: 0;
        }
        .subtitle {
          font-size: 11px;
          color: #94a3b8;
          letter-spacing: 0.02em;
          margin: 0;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #818cf8;
          background: rgba(99, 102, 241, 0.12);
          border: 1px solid rgba(99, 102, 241, 0.3);
          border-radius: 4px;
          padding: 4px 8px;
        }
        .visual-display {
          position: relative;
          background: #030712;
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 6px;
          margin-bottom: 14px;
          overflow: hidden;
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
          background: rgba(255, 255, 255, 0.03);
          border-top: 1px solid rgba(99, 102, 241, 0.15);
          font-family: monospace;
          font-size: 11px;
          color: #cbd5e1;
        }
        .actions-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          margin-bottom: 12px;
        }
        .touch-btn {
          min-height: 44px;
          min-width: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(99, 102, 241, 0.08);
          border: 1px solid rgba(99, 102, 241, 0.25);
          color: #c7d2fe;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
          padding: 6px 8px;
          text-align: center;
        }
        .touch-btn:hover {
          background: rgba(99, 102, 241, 0.18);
          border-color: rgba(99, 102, 241, 0.5);
        }
        .touch-btn:active {
          transform: translateY(1px);
        }
        .output-box {
          background: #020617;
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 6px;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          line-height: 1.45;
          color: #94a3b8;
          min-height: 48px;
          max-height: 85px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
      </style>

      <div class="header">
        <div class="brand-meta">
          <h2 class="title">Pipeline Composer</h2>
          <p class="subtitle">Dynamic Command Orchestration Engine</p>
        </div>
        <div id="status-badge" class="badge">READY</div>
      </div>

      <div class="visual-display">
        <canvas id="flow-canvas" width="340" height="64"></canvas>
        <div class="telemetry-row">
          <span>Execution: Direct</span>
          <span>Risk Gate: Fail-Closed</span>
        </div>
      </div>

      <div class="actions-grid">
        <button id="btn-list" class="touch-btn" type="button">Catalog</button>
        <button id="btn-inspect" class="touch-btn" type="button">Inspect</button>
        <button id="btn-history" class="touch-btn" type="button">History</button>
      </div>

      <div id="card-out" class="output-box">Dynamic command registry operational. Ready for pipeline invocation.</div>
    `;

    this.shadowRoot.querySelector('#btn-list')?.addEventListener('click', () => {
      this.execute('list');
    });
    this.shadowRoot.querySelector('#btn-inspect')?.addEventListener('click', () => {
      this.execute('read', ['startup-check']);
    });
    this.shadowRoot.querySelector('#btn-history')?.addEventListener('click', () => {
      this.execute('history');
    });
  }
}

if (!customElements.get('tr-composable-cli-card')) {
  customElements.define('tr-composable-cli-card', PipelineComposerCard);
}
