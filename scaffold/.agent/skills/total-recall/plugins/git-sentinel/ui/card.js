/**
 * Git Hygiene — Repository Hygiene & Branch Integrity
 * Bespoke Animated Web Component Card Face with Live Branch Pulse Rings.
 *
 * Zero emojis, authentic commercial brand identity, touch-first ergonomics (>=44px).
 */

export class GitSentinelCard extends HTMLElement {
  constructor() {
    super();
    this.status = 'Ready';
    this.executing = false;
  }

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this.render();
    this.initPulseAnimation();
  }

  async execute(action, args = []) {
    const out = this.shadowRoot.querySelector('#card-out');
    const badge = this.shadowRoot.querySelector('#status-badge');
    if (out) out.textContent = `[SENTINEL AUDITOR] Scanning ${action.toUpperCase()}...`;
    if (badge) badge.textContent = 'SCANNING';
    this.executing = true;

    try {
      const res = await this.host?.run(action, args);
      let text = '';
      if (typeof res === 'object') {
        text = res.output || JSON.stringify(res, null, 2);
      } else {
        text = String(res || 'Audit completed without output.');
      }
      if (out) out.textContent = text.trim();
      if (badge) badge.textContent = 'SECURE';
    } catch (err) {
      if (out) out.textContent = `[SENTINEL ALERT] ${err.message}`;
      if (badge) badge.textContent = 'ALERT';
    } finally {
      this.executing = false;
    }
  }

  initPulseAnimation() {
    const canvas = this.shadowRoot.querySelector('#sentinel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let ringR1 = 4;
    let ringR2 = 14;
    let ringR3 = 24;

    const draw = () => {
      if (!this.isConnected) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const maxR = 30;

      // Draw branch spine
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 80, cy);
      ctx.lineTo(cx + 80, cy);
      ctx.stroke();

      // Branch forks
      ctx.beginPath();
      ctx.moveTo(cx - 30, cy);
      ctx.lineTo(cx - 10, cy - 14);
      ctx.lineTo(cx + 40, cy - 14);
      ctx.stroke();

      // Draw pulse rings from head
      const drawRing = (r) => {
        const alpha = Math.max(0, 1 - (r / maxR));
        ctx.strokeStyle = this.executing ? `rgba(52, 211, 153, ${alpha})` : `rgba(16, 185, 129, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      };

      drawRing(ringR1);
      drawRing(ringR2);
      drawRing(ringR3);

      // Core commit node
      ctx.fillStyle = '#34d399';
      ctx.shadowColor = '#34d399';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      const speed = this.executing ? 0.8 : 0.35;
      ringR1 = (ringR1 + speed) % maxR;
      ringR2 = (ringR2 + speed) % maxR;
      ringR3 = (ringR3 + speed) % maxR;

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
          background: #061510;
          color: #d1fae5;
          border-radius: 8px;
          border: 1px solid rgba(16, 185, 129, 0.35);
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
          color: #a7f3d0;
          margin: 0;
        }
        .subtitle {
          font-size: 11px;
          color: #10b981;
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
          color: #34d399;
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          border-radius: 4px;
          padding: 4px 8px;
        }
        .visual-display {
          position: relative;
          background: #020b08;
          border: 1px solid rgba(16, 185, 129, 0.2);
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
          border-top: 1px solid rgba(16, 185, 129, 0.15);
          font-family: monospace;
          font-size: 11px;
          color: #6ee7b7;
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
          background: rgba(16, 185, 129, 0.08);
          border: 1px solid rgba(16, 185, 129, 0.25);
          color: #a7f3d0;
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
          background: rgba(16, 185, 129, 0.18);
          border-color: rgba(16, 185, 129, 0.5);
        }
        .touch-btn:active {
          transform: translateY(1px);
        }
        .output-box {
          background: #010604;
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 6px;
          padding: 8px 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          line-height: 1.45;
          color: #6ee7b7;
          min-height: 48px;
          max-height: 85px;
          overflow-y: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
      </style>

      <div class="header">
        <div class="brand-meta">
          <h2 class="title">Git Hygiene</h2>
          <p class="subtitle">Repository Hygiene & Branch Integrity</p>
        </div>
        <div id="status-badge" class="badge">READY</div>
      </div>

      <div class="visual-display">
        <canvas id="sentinel-canvas" width="340" height="64"></canvas>
        <div class="telemetry-row">
          <span>Worktree: Monitored</span>
          <span>Upstream: Origin Tracking</span>
        </div>
      </div>

      <div class="actions-grid">
        <button id="btn-audit" class="touch-btn" type="button">Audit Status</button>
        <button id="btn-diff" class="touch-btn" type="button">Working Diff</button>
        <button id="btn-help" class="touch-btn" type="button">Help</button>
      </div>

      <div id="card-out" class="output-box">Worktree watcher armed. Dispatch audit to inspect repository status.</div>
    `;

    this.shadowRoot.querySelector('#btn-audit')?.addEventListener('click', () => {
      this.execute('audit');
    });
    this.shadowRoot.querySelector('#btn-diff')?.addEventListener('click', () => {
      this.execute('diff');
    });
    this.shadowRoot.querySelector('#btn-help')?.addEventListener('click', () => {
      this.execute('help');
    });
  }
}

if (!customElements.get('tr-git-sentinel-card')) {
  customElements.define('tr-git-sentinel-card', GitSentinelCard);
}
