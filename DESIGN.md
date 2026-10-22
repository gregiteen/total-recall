---
colors:
  primary: "#8b5cf6"
  secondary: "#0f172a"
  accent: "#10b981"
  surface: "#1e293b"
  surfaceElevated: "#334155"
  border: "#334155"
  text: "#f8fafc"
  muted: "#94a3b8"
  amber: "#f59e0b"
  danger: "#ef4444"
typography:
  fontFamily:
    heading: "'Space Grotesk', -apple-system, sans-serif"
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    code: "'JetBrains Mono', ui-monospace, Menlo, monospace"
  scale:
    h1: "2.75rem"
    h2: "1.875rem"
    h3: "1.25rem"
    body: "1rem"
    caption: "0.8125rem"
rounded:
  sm: "6px"
  md: "10px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
---

# Total Recall (VibeBrain) — Design System Tokens

Canonical design specifications for Total Recall web interfaces, visual card plugins, and marketing landing pages.

## Color Tokens & Brand Personality

The Total Recall visual identity balances high-velocity engineering precision with clean, modern minimalism:

- **Electric Violet (`#8b5cf6`)**: The primary signature of the VibeBrain cognitive runtime.
- **Deep Slate (`#0f172a`)**: The grounding dark-mode backdrop ensuring comfortable terminal sessions.
- **Emerald Pulse (`#10b981`)**: Signifies local-first zero-cost intelligence and Ollama fleet readiness.
- **Amber Signal (`#f59e0b`)**: Telemetry indicators, warning states, and supervisor gateways.

## Touch Ergonomics & Card Contracts

Every plugin card face must adhere to strict spatial and touch standards:
- Interactive click and touch targets must measure at least 44px in height.
- Component corners maintain uniform 10px rounding (`--radius-md`).
- Dark-mode elevation relies on translucent surface borders rather than synthetic drop shadows.
