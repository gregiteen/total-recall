import type { CSSProperties } from 'react'

interface AnimatedBrandMarkProps {
  size?: number
  className?: string
  alt?: string
}

export default function AnimatedBrandMark({
  size = 42,
  className = '',
  alt = 'Total Recall Animated Mark',
}: AnimatedBrandMarkProps) {
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    perspective: 800,
  }

  return (
    <div className={`animated-brand-mark ${className}`} style={containerStyle} title={alt}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* Radial glow filter for high-end glass look */}
          <filter id="tr-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <linearGradient id="tr-top-facet" x1="50" y1="20" x2="80" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.8" />
          </linearGradient>

          <linearGradient id="tr-left-facet" x1="20" y1="38" x2="50" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#2563eb" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.85" />
          </linearGradient>

          <linearGradient id="tr-right-facet" x1="80" y1="38" x2="50" y2="80" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.95" />
          </linearGradient>

          <linearGradient id="tr-orbit-ring" x1="10" y1="50" x2="90" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.1" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#818cf8" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <style>{`
          @keyframes tr-float {
            0%, 100% {
              transform: translateY(0px) rotate(0deg);
            }
            50% {
              transform: translateY(-3px) rotate(1deg);
            }
          }

          @keyframes tr-orbit {
            0% {
              transform: rotateX(68deg) rotateZ(0deg);
            }
            100% {
              transform: rotateX(68deg) rotateZ(360deg);
            }
          }

          @keyframes tr-pulse {
            0%, 100% {
              opacity: 0.6;
              transform: scale(0.96);
            }
            50% {
              opacity: 1;
              transform: scale(1.04);
            }
          }

          .tr-cube-group {
            transform-origin: 50px 50px;
            animation: tr-float 4.5s ease-in-out infinite;
          }

          .tr-orbit-plane {
            transform-origin: 50px 50px;
            animation: tr-orbit 7s linear infinite;
          }

          .tr-inner-core {
            transform-origin: 50px 50px;
            animation: tr-pulse 3s ease-in-out infinite;
          }
        `}</style>

        {/* Orbit ring rotating in 3D perspective */}
        <g className="tr-orbit-plane">
          <ellipse
            cx="50"
            cy="50"
            rx="42"
            ry="42"
            stroke="url(#tr-orbit-ring)"
            strokeWidth="1.5"
            strokeDasharray="16 8"
          />
          {/* Orbiting glowing memory node */}
          <circle cx="92" cy="50" r="3.5" fill="#38bdf8" filter="url(#tr-glow)" />
          <circle cx="92" cy="50" r="1.8" fill="#ffffff" />
        </g>

        {/* Floating isometric memory cube */}
        <g className="tr-cube-group">
          {/* Top Facet */}
          <polygon
            points="50,22 80,38 50,54 20,38"
            fill="url(#tr-top-facet)"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="0.8"
          />

          {/* Left Facet */}
          <polygon
            points="20,38 50,54 50,86 20,70"
            fill="url(#tr-left-facet)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.8"
          />

          {/* Right Facet */}
          <polygon
            points="50,54 80,38 80,70 50,86"
            fill="url(#tr-right-facet)"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="0.8"
          />

          {/* Glowing central core node */}
          <g className="tr-inner-core">
            <polygon
              points="50,42 62,49 50,56 38,49"
              fill="rgba(147, 197, 253, 0.4)"
            />
            <circle cx="50" cy="49" r="2.5" fill="#ffffff" filter="url(#tr-glow)" />
          </g>
        </g>
      </svg>
    </div>
  )
}
