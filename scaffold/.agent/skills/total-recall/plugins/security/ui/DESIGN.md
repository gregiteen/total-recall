# DESIGN.md — Security Plugin (Tin Foil)

## Brand Identity & Aesthetic
- **Brand Name**: Tin Foil
- **Wordmark**: `[TIN//FOIL]`
- **Theme**: Crimson and Obsidian Host Hardening Console
- **Tone**: Deterministic, vigilant, fail-closed, precise

## Design Tokens

The card face defines and consumes these custom properties:

```css
:host {
  --face-bg: #180d11;
  --face-bg-subtle: #251017;
  --face-bg-surface: #11070a;
  --face-bg-table: #0d0508;
  --face-bg-code: #0a0406;
  --face-accent: #f43f5e;
  --face-accent-hover: rgba(244, 63, 94, 0.22);
  --face-accent-glow: rgba(244, 63, 94, 0.35);
  --face-border-subtle: rgba(244, 63, 94, 0.28);
  --face-border-faint: rgba(244, 63, 94, 0.2);
  --face-border-cell: rgba(244, 63, 94, 0.15);
  --face-border-alert: rgba(244, 63, 94, 0.25);
  --face-text: #f1f5f9;
  --face-text-heading: #fecdd3;
  --face-text-muted: #fda4af;
  --face-text-cell: #f8fafc;
  --face-text-desc: #cbd5e1;
  --face-danger: #fb7185;
  --face-warning: #fca5a5;
}
```

## System Integration
- The face binds `--text-primary` with fallback to `var(--face-text)`.
- The face binds `--border` with fallback to `var(--face-accent-glow)`.
- All clickable elements enforce a minimum height of 44px for touch ergonomics.
- Reduced motion styles suppress animation when requested by system settings.
