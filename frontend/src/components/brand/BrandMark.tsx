/** Official Total Recall brand marks from portfolio-site assets/logos. */

export type BrandVariant = 'lockup' | 'icon' | 'badge' | 'mark'

interface BrandMarkProps {
  variant?: BrandVariant
  /** Height in px (width auto). */
  height?: number
  className?: string
  alt?: string
  /** Light plate behind lockup for dark surfaces (PNG has white bg). */
  plate?: boolean
}

const SRC: Record<BrandVariant, string> = {
  lockup: '/brand/total-recall-lockup.png',
  icon: '/brand/total-recall-icon.svg',
  badge: '/brand/total-recall-badge.jpg',
  mark: '/brand/total-recall-mark.svg',
}

export default function BrandMark({
  variant = 'lockup',
  height = 40,
  className = '',
  alt = 'Total Recall',
  plate = false,
}: BrandMarkProps) {
  const isSquare = variant === 'icon' || variant === 'badge' || variant === 'mark'
  const img = (
    <img
      src={SRC[variant]}
      alt={alt}
      height={height}
      width={isSquare ? height : undefined}
      className={className}
      style={{
        height,
        width: isSquare ? height : 'auto',
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
      }}
      draggable={false}
    />
  )

  if (!plate) return img

  return (
    <div
      className="brand-plate"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: variant === 'lockup' ? '10px 14px' : 8,
        borderRadius: variant === 'lockup' ? 14 : 16,
        background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.6) inset, 0 12px 32px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(148,163,184,0.25)',
      }}
    >
      {img}
    </div>
  )
}

/** Compact cube-style brand chip for nav / floating chrome. */
export function BrandChip({ size = 36 }: { size?: number }) {
  return (
    <div
      className="brand-chip"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow:
          '0 0 0 1px rgba(96,165,250,0.35), 0 8px 24px rgba(37,99,235,0.25)',
        background: 'linear-gradient(145deg, #1e3a8a, #0b1220)',
      }}
    >
      <img
        src="/brand/total-recall-icon.svg"
        alt=""
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        draggable={false}
      />
    </div>
  )
}
