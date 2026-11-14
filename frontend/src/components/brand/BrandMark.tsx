import AnimatedBrandMark from './AnimatedBrandMark'

export type BrandVariant = 'lockup' | 'icon' | 'badge' | 'mark' | 'animated'

interface BrandMarkProps {
  variant?: BrandVariant
  /** Height in px (width auto). */
  height?: number
  className?: string
  alt?: string
  /** Light plate behind lockup for dark surfaces (PNG has white bg). */
  plate?: boolean
  /** Render dynamic looping 3D vector animation mark. */
  animated?: boolean
}

const SRC: Record<Exclude<BrandVariant, 'animated'>, string> = {
  lockup: '/brand/total-recall-lockup-transparent.png',
  icon: '/brand/total-recall-icon.svg',
  badge: '/brand/total-recall-badge.jpg',
  mark: '/brand/total-recall-mark.svg',
}

export { AnimatedBrandMark }

export default function BrandMark({
  variant = 'lockup',
  height = 40,
  className = '',
  alt = 'Total Recall',
  plate = false,
  animated = false,
}: BrandMarkProps) {
  if (animated || variant === 'animated') {
    return <AnimatedBrandMark size={height} className={className} alt={alt} />
  }

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
        filter: variant === 'lockup'
          ? 'drop-shadow(0 0 14px rgba(56, 189, 248, 0.52)) drop-shadow(0 0 28px rgba(37, 99, 235, 0.28))'
          : undefined,
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
        padding: 8,
        borderRadius: 16,
        background: 'rgba(15, 23, 42, 0.55)',
        boxShadow: '0 0 24px rgba(56, 189, 248, 0.22), 0 0 0 1px rgba(56, 189, 248, 0.22)',
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
