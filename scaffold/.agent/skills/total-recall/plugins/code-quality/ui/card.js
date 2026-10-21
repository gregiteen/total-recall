/**
 * Code Quality Gates — Deterministic Quality Gate Engine
 * Bespoke Animated Web Component Card Face with Live Gate Waveform Visualizer.
 *
 * Zero emojis, authentic commercial brand identity, touch-first ergonomics (>=44px).
 */

export class CodeQualityCard extends HTMLElement {
  constructor() {
    super();
    this.status = 'Idle';
    this.passRate = '100%';
    this.activeGate = 'Lint & Typecheck';
    this.executing = false;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this.initWaveformAnimation();
  }

  async execute(action, args = []) {
    const out = this.shadowRoot.querySelector('#card-out');
    const statusBadge = this.shadowRoot.querySelector('#status-badge');
    if (out) out.textContent = `[GATE CONTROLLER] Executing ${action.toUpperCase()}...`;
    if (statusBadge) statusBadge.textContent = 'RUNNING';
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
      if (statusBadge) statusBadge.textContent = 'PASS';
    } catch (err) {
      if (out) out.textContent = `[GATE FAILURE] ${err.message}`;
      if (statusBadge) statusBadge.textContent = 'FAIL';
    } finally {
      this.executing = false;
    }
  }

  initWaveformAnimation() {
    const canvas = this.shadowRoot.querySelector('#qa-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let offset = 0;
    const draw = () => {
      if (!this.isConnected) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      // Coordinate grid lines
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 20) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += 15) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      // Quality signal waveform
      ctx.beginPath();
      ctx.moveTo(0, mid);
      for (let x = 0; x < w; x++) {
        const freq = this.executing ? 0.08 : 0.04;
        const amp = this.executing ? 18 : 10;
        const y = mid + Math.sin((x + offset) * freq) * Math.cos((x + offset) * 0.02) * amp;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = this.executing ? '#38bdf8' : '#eab308';
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Pulse scan head
      const scanX = (offset * 1.5) % w;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(scanX, mid, 3, 0, Math.PI * 2);
      ctx.fill();

      offset += this.executing ? 3 : 1;
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
          background: #090d16;
          color: #fef9c3;
          border-radius: 8px;
          border: 1px solid rgba(234, 179, 8, 0.35);
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
          color: #fef08a;
          margin: 0;
        }
        .subtitle {
          font-size: 11px;
          color: #a1a1aa;
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
          color: #eab308;
          background: rgba(234, 179, 8, 0.12);
          border: 1px solid rgba(234, 179, 8, 0.3);
          border-radius: 4px;
          padding: 4px 8px;
        }
        .visual-display {
          position: relative;
          background: #030712;
          border: 1px solid rgba(234, 179, 8, 0.2);
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
          border-top: 1px solid rgba(234, 179, 8, 0.15);
          font-family: monospace;
          font-size: 11px;
          color: #d4d4d8;
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
          background: rgba(234, 179, 8, 0.08);
          border: 1px solid rgba(234, 179, 8, 0.25);
          color: #fef08a;
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
          background: rgba(234, 179, 8, 0.18);
          border-color: rgba(234, 179, 8, 0.5);
        }
        .touch-btn:active {
          transform: translateY(1px);
        }
        .output-box {
          background: #020617;
          border: 1px solid rgba(234, 179, 8, 0.2);
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
          <h2 class="title">Code Quality Gates</h2>
          <p class="subtitle">Deterministic Gate Enforcement Engine</p>
        </div>
        <div id="status-badge" class="badge">READY</div>
      </div>

      <div class="visual-display">
        <canvas id="qa-canvas" width="340" height="64"></canvas>
        <div class="telemetry-row">
          <span>Gate: Strict Pass/Fail</span>
          <span>Coverage: 100%</span>
        </div>
      </div>

      <div class="actions-grid">
        <button id="btn-status" class="touch-btn" type="button">Audit</button>
        <button id="btn-lint" class="touch-btn" type="button">Lint</button>
        <button id="btn-test" class="touch-btn" type="button">Gates</button>
      </div>

      <div id="card-out" class="output-box">Quality monitoring telemetry active. All gates operational.</div>
    `;

    this.shadowRoot.querySelector('#btn-status')?.addEventListener('click', () => {
      this.execute('status');
    });
    this.shadowRoot.querySelector('#btn-lint')?.addEventListener('click', () => {
      this.execute('check');
    });
    this.shadowRoot.querySelector('#btn-test')?.addEventListener('click', () => {
      this.execute('run');
    });
  }
}

if (!customElements.get('tr-code-quality-card')) {
  customElements.define('tr-code-quality-card', CodeQualityCard);
}
