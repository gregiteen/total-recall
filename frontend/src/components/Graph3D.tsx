/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useMemo } from "react"
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent } from "react"
import type { MemoryNode, ResearchItem } from "../types"
import type { ChatThread } from "../api"
import { renderMarkdown } from "./MarkdownUtils"

interface Graph3DProps {
  threads: ChatThread[]
  memoryNodes: MemoryNode[]
  researchItems: ResearchItem[]
  onOpenThread: (threadId: string) => void
  onGroundMemoryNode: (slug: string) => void
  selectedGroundingNodes: string[]
  /** When false, canvas ignores pointer events (chat background decoration). Default true. */
  interactive?: boolean
}

interface VisualNode {
  id: string
  type: "thread" | "memory" | "research"
  title: string
  subtitle: string
  status?: string
  excerpt?: string
  originalData: ChatThread | MemoryNode | ResearchItem
  // Initial 3D coordinates
  x: number
  y: number
  z: number
  // Projected screen coordinates
  px?: number
  py?: number
  pz?: number
  scale?: number
}

interface VisualLink {
  source: VisualNode
  target: VisualNode
  opacity: number
  color?: string
  dashPattern?: number[]
}

export default function Graph3D({
  threads,
  memoryNodes,
  researchItems,
  onOpenThread,
  onGroundMemoryNode,
  selectedGroundingNodes,
  interactive = true,
}: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Projection configuration state
  const [zoom, setZoom] = useState<number>(1.2)
  const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<VisualNode | null>(null)
  const [dragging, setDragging] = useState<boolean>(false)
  const [visibleTypes, setVisibleTypes] = useState({
    research: true,
    observations: true,
    rules: true,
    threads: false,
  })

  // Dragging and orbital rotation state (stored in refs for high frame rate access)
  const angleX = useRef<number>(0.3)
  const angleY = useRef<number>(0.5)
  const isDragging = useRef<boolean>(false)
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const velocityX = useRef<number>(0.002) // Auto rotation speed
  const velocityY = useRef<number>(0)

  // Generate deterministic 3D nodes using Fibonacci Sphere layout
  const nodes = useMemo(() => {
    const list: VisualNode[] = []

    // 1. Thread nodes
    if (visibleTypes.threads) {
      threads.forEach((t) => {
        list.push({
          id: `thread-${t.id}`,
          type: 'thread',
          title: t.title || 'Untitled Thread',
          subtitle: `${t.turns} ${t.turns === 1 ? 'turn' : 'turns'}`,
          excerpt: `Conversation thread last updated ${new Date(t.lastUpdated).toLocaleDateString()}`,
          originalData: t,
          x: 0,
          y: 0,
          z: 0,
        })
      })
    }

    // 2. Memory nodes
    memoryNodes.forEach((m) => {
      const category = (m.category || 'general').toLowerCase()
      const isRule = ['invariants', 'preferences', 'patterns', 'anti-patterns'].includes(category)
      if (isRule) {
        if (!visibleTypes.rules) return
      } else {
        if (!visibleTypes.observations) return
      }

      list.push({
        id: `memory-${m.slug}`,
        type: 'memory',
        title: m.title || m.slug,
        subtitle: `Memory Node • ${m.category || 'general'}`,
        status: m.status || 'active',
        excerpt: m.excerpt || m.body || 'No summary details available.',
        originalData: m,
        x: 0,
        y: 0,
        z: 0,
      })
    })

    // 3. Research nodes
    if (visibleTypes.research) {
      researchItems.forEach((r) => {
        list.push({
          id: `research-${r.id}`,
          type: 'research',
          title: r.topic,
          subtitle: `Research Topic • ${r.priority} priority`,
          status: r.status,
          excerpt: r.notes || `Research task currently ${r.status}. Created on ${new Date(r.created_at).toLocaleDateString()}`,
          originalData: r,
          x: 0,
          y: 0,
          z: 0,
        })
      })
    }

    // Apply Fibonacci Sphere algorithm for beautiful uniform distribution
    const N = list.length
    const radius = 220 // Size of the sphere volume

    for (let i = 0; i < N; i++) {
      // Golden ratio spacing
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N)
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5)

      list[i].x = radius * Math.sin(phi) * Math.cos(theta)
      list[i].y = radius * Math.sin(phi) * Math.sin(theta)
      list[i].z = radius * Math.cos(phi)

      // Add a tiny bit of cluster jitter based on node type to separate planes slightly
      if (list[i].type === 'thread') {
        list[i].y += 30
      } else if (list[i].type === 'research') {
        list[i].x -= 30
      } else {
        list[i].z += 20
      }
    }

    return list
  }, [threads, memoryNodes, researchItems, visibleTypes])

  // Establish links/connections between related items
  const links = useMemo(() => {
    const list: VisualLink[] = []

    // Match criteria for a beautiful connected web
    nodes.forEach((nodeA, idx) => {
      // 1. Link Research nodes to their matching Memory node
      if (nodeA.type === "research") {
        const researchItem = nodeA.originalData as ResearchItem
        if (researchItem.node_slug) {
          const targetNode = nodes.find(n => n.type === "memory" && (n.originalData as any).slug === researchItem.node_slug)
          if (targetNode) {
            list.push({ source: nodeA, target: targetNode, opacity: 0.8 })
          }
        }
      }

      // 2. Link Memory nodes based on explicit SSSS v2 relations (related, supersedes, contradicts)
      if (nodeA.type === "memory") {
        const memA = nodeA.originalData as MemoryNode
        
        // Explicit related links (purple)
        if (Array.isArray(memA.related)) {
          memA.related.forEach(relSlug => {
            const targetNode = nodes.find(n => n.type === "memory" && (n.originalData as any).slug === relSlug)
            if (targetNode) {
              list.push({
                source: nodeA,
                target: targetNode,
                opacity: 0.7,
                color: "rgba(96, 165, 250, 0.55)"
              })
            }
          })
        }

        // Explicit contradicts links (red)
        if (Array.isArray(memA.contradicts)) {
          memA.contradicts.forEach(conSlug => {
            const targetNode = nodes.find(n => n.type === "memory" && (n.originalData as any).slug === conSlug)
            if (targetNode) {
              list.push({
                source: nodeA,
                target: targetNode,
                opacity: 0.9,
                color: "rgba(239, 68, 68, 0.7)"
              })
            }
          })
        }

        // Explicit supersedes links (dashed orange)
        if (Array.isArray(memA.supersedes)) {
          memA.supersedes.forEach(supSlug => {
            const targetNode = nodes.find(n => n.type === "memory" && (n.originalData as any).slug === supSlug)
            if (targetNode) {
              list.push({
                source: nodeA,
                target: targetNode,
                opacity: 0.8,
                color: "rgba(245, 158, 11, 0.6)",
                dashPattern: [3, 3]
              })
            }
          })
        }

        // Fallback: Link Memory nodes of similar categories or tags if no explicit relations exist to maintain beautiful web structure
        if (!memA.related?.length && !memA.contradicts?.length && !memA.supersedes?.length) {
          let count = 0
          for (let j = idx + 1; j < nodes.length; j++) {
            const nodeB = nodes[j]
            if (nodeB.type === "memory" && count < 2) {
              const memB = nodeB.originalData as MemoryNode
              if (memA.category && memA.category === memB.category) {
                list.push({ source: nodeA, target: nodeB, opacity: 0.4 })
                count++
              }
            }
          }
        }
      }

      // 3. Link Chat threads to grounded memory nodes if titles/slugs align or randomly to create constellations
      if (nodeA.type === "thread") {
        // Find 1-2 memory nodes to anchor the thread node
        let matches = 0
        for (let j = 0; j < nodes.length; j++) {
          const nodeB = nodes[j]
          if (nodeB.type === "memory" && matches < 1) {
            // Draw a thin connection
            list.push({ source: nodeA, target: nodeB, opacity: 0.35 })
            matches++
          }
        }
      }
    })

    return list
  }, [nodes])

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    const focalLength = 400

    // Set dimensions based on client bounds
    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      canvas.width = (rect?.width || window.innerWidth) * window.devicePixelRatio
      canvas.height = (rect?.height || window.innerHeight) * window.devicePixelRatio
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio)
    }
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    const draw = () => {
      const width = canvas.width / window.devicePixelRatio
      const height = canvas.height / window.devicePixelRatio
      ctx.clearRect(0, 0, width, height)

      const centerX = width / 2
      const centerY = height / 2

      // Apply orbital inertia
      if (!isDragging.current) {
        angleY.current += velocityX.current
        angleX.current += velocityY.current
        // Smooth deceleration
        velocityX.current *= 0.98
        velocityY.current *= 0.98

        // Maintain gentle orbital motion if rotation dies down completely
        if (Math.abs(velocityX.current) < 0.001) {
          velocityX.current = 0.0015
        }
      }

      const cosX = Math.cos(angleX.current)
      const sinX = Math.sin(angleX.current)
      const cosY = Math.cos(angleY.current)
      const sinY = Math.sin(angleY.current)

      // Project all nodes first
      nodes.forEach((node) => {
        // Rotate Y axis
        const x1 = node.x * cosY + node.z * sinY
        const z1 = -node.x * sinY + node.z * cosY

        // Rotate X axis
        const y2 = node.y * cosX - z1 * sinX
        const z2 = node.y * sinX + z1 * cosX

        // Perspective Projection
        const scale = focalLength / (focalLength + z2)
        node.px = centerX + x1 * scale * zoom
        node.py = centerY + y2 * scale * zoom
        node.pz = z2
        node.scale = scale
      })

      // Sort nodes by depth (z-index drawing) to render back elements first
      const sortedNodes = [...nodes].sort((a, b) => (b.pz || 0) - (a.pz || 0))

      // ─── DRAW LINKS ───
      ctx.lineWidth = 1.0
      links.forEach((link) => {
        const { source, target, opacity, color, dashPattern } = link
        if (source.px === undefined || source.py === undefined || target.px === undefined || target.py === undefined) return

        // Fade links that are deeper or far
        const avgZ = ((source.pz || 0) + (target.pz || 0)) / 2
        const depthFade = Math.max(0.1, Math.min(1.0, 1 - (avgZ + 200) / 500))

        // Highlight links connected to the hovered or selected nodes
        const isHighlight =
          hoveredNode?.id === source.id ||
          hoveredNode?.id === target.id ||
          selectedNode?.id === source.id ||
          selectedNode?.id === target.id

        // Glow connections
        ctx.beginPath()
        ctx.moveTo(source.px, source.py)
        ctx.lineTo(target.px, target.py)

        if (dashPattern) {
          ctx.setLineDash(dashPattern)
        } else {
          ctx.setLineDash([])
        }

        if (isHighlight) {
          ctx.strokeStyle = color || (source.type === "memory" ? "rgba(96, 165, 250, 0.55)" : source.type === "thread" ? "rgba(34, 211, 238, 0.55)" : "rgba(251, 191, 36, 0.55)")
          ctx.lineWidth = 1.8
        } else {
          ctx.strokeStyle = color 
            ? color.replace(/[\d.]+\)$/, `${opacity * 0.4 * depthFade})`) 
            : `rgba(100, 116, 139, ${opacity * 0.25 * depthFade})`
          ctx.lineWidth = 0.8
        }
        ctx.stroke()
        ctx.setLineDash([]) // Reset dash pattern
      })

      // ─── DRAW NODES ───
      sortedNodes.forEach((node) => {
        if (node.px === undefined || node.py === undefined || node.scale === undefined) return

        // Support confidence decay mapping to node size
        const confidenceMultiplier = node.type === "memory" && (node.originalData as any).confidence !== undefined 
          ? Math.max(0.4, (node.originalData as any).confidence) 
          : 1.0
        
        const size = Math.max(4, Math.min(22, 10 * node.scale * zoom * confidenceMultiplier))
        const isHovered = hoveredNode?.id === node.id
        const isSelected = selectedNode?.id === node.id
        const isGrounded = node.type === "memory" && selectedGroundingNodes.includes((node.originalData as any).slug)

        // Draw radial glow
        const gradient = ctx.createRadialGradient(
          node.px,
          node.py,
          size * 0.1,
          node.px,
          node.py,
          size * (isHovered || isSelected ? 2.5 : 1.5)
        )

        // Brand-aligned palette: readable on dark, category-distinct
        let color = "#60a5fa" // facts / default memory (sky)
        let glowColor = "rgba(96, 165, 250, 0.28)"

        if (node.type === "memory") {
          const category = ((node.originalData as MemoryNode).category || "general").toLowerCase()
          const palette: Record<string, [string, string]> = {
            invariants: ["#38bdf8", "rgba(56, 189, 248, 0.3)"], // cyan-bright — must-rules
            preferences: ["#818cf8", "rgba(129, 140, 248, 0.28)"], // soft indigo
            patterns: ["#34d399", "rgba(52, 211, 153, 0.28)"], // emerald
            "anti-patterns": ["#f87171", "rgba(248, 113, 113, 0.28)"], // rose
            facts: ["#60a5fa", "rgba(96, 165, 250, 0.28)"], // sky blue
            concepts: ["#a78bfa", "rgba(167, 139, 250, 0.28)"], // violet
            decisions: ["#fbbf24", "rgba(251, 191, 36, 0.28)"], // amber
            lore: ["#c084fc", "rgba(192, 132, 252, 0.25)"], // orchid
            corrections: ["#fb923c", "rgba(251, 146, 60, 0.28)"], // orange
          }
          const pair = palette[category]
          if (pair) {
            color = pair[0]
            glowColor = pair[1]
          } else if (["invariants", "preferences", "patterns", "anti-patterns"].includes(category)) {
            color = "#818cf8"
            glowColor = "rgba(129, 140, 248, 0.28)"
          }
        } else if (node.type === "thread") {
          color = "#22d3ee" // cyan — sessions
          glowColor = "rgba(34, 211, 238, 0.28)"
        } else if (node.type === "research") {
          color = "#fbbf24" // amber — research
          glowColor = "rgba(251, 191, 36, 0.28)"
        }

        gradient.addColorStop(0, color)
        gradient.addColorStop(0.4, color)
        gradient.addColorStop(1, glowColor)

        // Faint shadow/depth sorting opacity and confidence scaling
        const nodeDepthOpacity = Math.max(0.2, Math.min(1.0, 1 - (node.pz || 0 + 200) / 450))
        const confidenceOpacity = node.type === "memory" && (node.originalData as any).confidence !== undefined 
          ? Math.max(0.35, (node.originalData as any).confidence) 
          : 1.0

        ctx.globalAlpha = nodeDepthOpacity * confidenceOpacity

        ctx.beginPath()
        ctx.arc(node.px, node.py, size * (isHovered || isSelected ? 2.5 : 1.5), 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Core solid sphere
        ctx.beginPath()
        ctx.arc(node.px, node.py, size * 0.7, 0, Math.PI * 2)
        ctx.fillStyle = isHovered || isSelected ? '#ffffff' : color
        ctx.fill()

        // Highlight ring around selected node
        if (isSelected || isGrounded) {
          ctx.beginPath()
          ctx.arc(node.px, node.py, size * 1.5, 0, Math.PI * 2)
          ctx.strokeStyle = '#ffffff'
          ctx.lineWidth = 1.5
          ctx.stroke()
        }

        ctx.globalAlpha = 1.0 // Reset opacity

        // ─── RENDER LABELS ───
        // Display labels for hovered/selected nodes or very close front nodes
        if (isHovered || isSelected || (node.scale > 1.15 && node.pz && node.pz < -100)) {
          ctx.font = isHovered || isSelected ? 'bold 12px var(--font-sans, system-ui)' : '10px var(--font-sans, system-ui)'
          ctx.fillStyle = isHovered || isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.75)'
          ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'
          ctx.shadowBlur = 4

          const labelText = node.title.length > 28 ? node.title.substring(0, 26) + '...' : node.title
          ctx.fillText(labelText, node.px + size * 1.6, node.py + size * 0.4)

          // Subtitle for hovered/selected nodes
          if (isHovered || isSelected) {
            ctx.font = '9px var(--font-sans, system-ui)'
            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
            ctx.fillText(node.subtitle, node.px + size * 1.6, node.py + size * 0.4 + 14)
          }

          // Reset shadows
          ctx.shadowBlur = 0
        }
      })

      animationFrameId = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [nodes, links, zoom, hoveredNode, selectedNode, selectedGroundingNodes])

  // Mouse / Touch Interaction Handlers
  const handleStartDrag = (clientX: number, clientY: number) => {
    isDragging.current = true
    setDragging(true)
    lastMousePos.current = { x: clientX, y: clientY }
    velocityX.current = 0
    velocityY.current = 0
  }

  const handleDrag = (clientX: number, clientY: number) => {
    if (!isDragging.current) return
    const dx = clientX - lastMousePos.current.x
    const dy = clientY - lastMousePos.current.y

    // Scale rotations based on coordinate displacement
    angleY.current += dx * 0.006
    angleX.current += dy * 0.006

    // Keep velocities for inertia on release
    velocityX.current = dx * 0.005
    velocityY.current = dy * 0.005

    lastMousePos.current = { x: clientX, y: clientY }
  }

  const handleEndDrag = () => {
    isDragging.current = false
    setDragging(false)
  }

  // Handle canvas mouse move to detect hovering
  const handleMouseMove = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    if (isDragging.current) {
      handleDrag(e.clientX, e.clientY)
      return
    }

    // Detect hovered node
    let closestNode: VisualNode | null = null
    let minDistance = 22 // Capture radius

    nodes.forEach((node) => {
      if (node.px === undefined || node.py === undefined) return
      const distance = Math.hypot(node.px - mouseX, node.py - mouseY)
      if (distance < minDistance) {
        minDistance = distance
        closestNode = node
      }
    })

    setHoveredNode(closestNode)
  }

  // Handle clicks to select nodes
  const handleCanvasClick = () => {
    if (isDragging.current && (Math.abs(velocityX.current) > 0.02 || Math.abs(velocityY.current) > 0.02)) {
      // It was a swift rotation drag, not a clean select click
      return
    }
    setSelectedNode(hoveredNode)
  }

  // Zoom Handler
  const handleWheel = (e: ReactWheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const zoomDelta = e.deltaY * -0.001
    setZoom((prev) => Math.max(0.5, Math.min(3.0, prev + zoomDelta)))
  }

  // Touch handlers
  const handleTouchStart = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      handleStartDrag(touch.clientX, touch.clientY)
    }
  }

  const handleTouchMove = (e: ReactTouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0]
      if (isDragging.current) {
        handleDrag(touch.clientX, touch.clientY)
      }

      // Update hover for touch interaction
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const touchX = touch.clientX - rect.left
      const touchY = touch.clientY - rect.top

      let closestNode: VisualNode | null = null
      let minDistance = 30 // Larger tap radius

      nodes.forEach((node) => {
        if (node.px === undefined || node.py === undefined) return
        const distance = Math.hypot(node.px - touchX, node.py - touchY)
        if (distance < minDistance) {
          minDistance = distance
          closestNode = node
        }
      })
      setHoveredNode(closestNode)
    }
  }

  return (
    <div
      className="graph-3d-wrapper"
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: 'radial-gradient(ellipse at 50% 40%, #0c1a33 0%, #070b14 55%, #030712 100%)',
        overflow: 'hidden',
        // Isolate stacking so UI chrome always sits above the canvas
        isolation: 'isolate',
      }}
    >
      
      {/* 3D Projection Canvas — always under UI chrome */}
      <canvas
        ref={canvasRef}
        onMouseDown={interactive ? (e) => handleStartDrag(e.clientX, e.clientY) : undefined}
        onMouseMove={interactive ? handleMouseMove : undefined}
        onMouseUp={interactive ? handleEndDrag : undefined}
        onMouseLeave={interactive ? handleEndDrag : undefined}
        onClick={interactive ? handleCanvasClick : undefined}
        onWheel={interactive ? handleWheel : undefined}
        onTouchStart={interactive ? handleTouchStart : undefined}
        onTouchMove={interactive ? handleTouchMove : undefined}
        onTouchEnd={interactive ? handleEndDrag : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          width: '100%',
          height: '100%',
          display: 'block',
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: interactive
            ? dragging
              ? 'grabbing'
              : hoveredNode
                ? 'pointer'
                : 'grab'
            : 'default',
        }}
      />

      {/* Cosmic Floating Background Dust overlay */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 45%, rgba(59, 130, 246, 0.08) 0%, transparent 55%)' }} />

      {/* Floating UI Elements */}
      <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 30, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', maxWidth: 280 }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#f1f5f9', fontWeight: 700, letterSpacing: '-0.02em' }}>Memory Constellation</h3>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(148,163,184,0.85)' }}>Vault · sessions · research — use filters to toggle types</p>
      </div>

      {/* Controls Overlay */}
      {interactive && (
      <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 40, display: 'flex', gap: 8, pointerEvents: 'auto' }}>
        <button 
          type="button"
          onClick={() => setZoom(prev => Math.min(3.0, prev + 0.2))} 
          style={{ width: 32, height: 32, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Zoom In"
        >
          ＋
        </button>
        <button 
          type="button"
          onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))} 
          style={{ width: 32, height: 32, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Zoom Out"
        >
          －
        </button>
        <button 
          type="button"
          onClick={() => { angleX.current = 0.3; angleY.current = 0.5; setZoom(1.2) }} 
          style={{ width: 32, height: 32, background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Reset Camera"
        >
          ⟲
        </button>
      </div>
      )}

      {/* Floating Filter Panel — left side under title so node drawer (right) never covers it */}
      {interactive && (
      <div 
        className="glass graph-type-filters"
        style={{ 
          position: 'absolute', 
          top: 72, 
          left: 16, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 10, 
          background: 'rgba(10, 15, 30, 0.92)', 
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '12px 16px', 
          borderRadius: 12, 
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
          width: 220,
          zIndex: 60,
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Constellation Filters
          </span>
          <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, color: 'var(--text-secondary)' }}>
            {nodes.length} visible
          </span>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={visibleTypes.research}
              onChange={() => setVisibleTypes(prev => ({ ...prev, research: !prev.research }))}
              style={{ accentColor: '#fbbf24', cursor: 'pointer' }}
            />
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 6px rgba(251,191,36,0.5)' }} />
            <span style={{ flex: 1 }}>Research</span>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>({researchItems.length})</span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={visibleTypes.observations}
              onChange={() => setVisibleTypes(prev => ({ ...prev, observations: !prev.observations }))}
              style={{ accentColor: '#60a5fa', cursor: 'pointer' }}
            />
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 6px rgba(96,165,250,0.5)' }} />
            <span style={{ flex: 1 }}>Memory</span>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              ({memoryNodes.filter(m => !['invariants', 'preferences', 'patterns', 'anti-patterns'].includes((m.category || 'general').toLowerCase())).length})
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={visibleTypes.rules}
              onChange={() => setVisibleTypes(prev => ({ ...prev, rules: !prev.rules }))}
              style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(90deg,#38bdf8,#f87171)', boxShadow: '0 0 6px rgba(56,189,248,0.4)' }} />
            <span style={{ flex: 1 }}>Rules</span>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              ({memoryNodes.filter(m => ['invariants', 'preferences', 'patterns', 'anti-patterns'].includes((m.category || 'general').toLowerCase())).length})
            </span>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={visibleTypes.threads}
              onChange={() => setVisibleTypes(prev => ({ ...prev, threads: !prev.threads }))}
              style={{ accentColor: '#22d3ee', cursor: 'pointer' }}
            />
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 6px rgba(34,211,238,0.5)' }} />
            <span style={{ flex: 1 }}>Sessions</span>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>({threads.length})</span>
          </label>
        </div>
      </div>
      )}

      {/* Selected Node Glass detail overlay drawer */}
      {selectedNode && (
        <div className="node-detail-drawer animate-slide-in">
          <div className="drawer-header">
            <span className={`drawer-badge badge-${selectedNode.type}`}>
              {selectedNode.type === "memory" ? "🧠 Knowledge" : selectedNode.type === "thread" ? "💬 Thread" : "🕵️ Research"}
            </span>
            <button className="drawer-close-btn" onClick={() => setSelectedNode(null)}>×</button>
          </div>
          <div className="drawer-body">
            <h4 className="drawer-title">{selectedNode.title}</h4>
            <span className="drawer-subtitle">{selectedNode.subtitle}</span>
            
            {selectedNode.type === "memory" && (
              <div className="drawer-meta-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", margin: "12px 0", fontSize: "11px", background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)" }}>
                {(selectedNode.originalData as any).confidence !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.45)" }}>Confidence:</span>{" "}
                    <strong style={{ color: (selectedNode.originalData as any).confidence > 0.7 ? "#22c55e" : "#f59e0b" }}>
                      {Math.round((selectedNode.originalData as any).confidence * 100)}%
                    </strong>
                  </div>
                )}
                {(selectedNode.originalData as any).importance !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.45)" }}>Importance:</span>{" "}
                    <strong style={{ color: "#a78bfa" }}>★ {(selectedNode.originalData as any).importance}/5</strong>
                  </div>
                )}
                {selectedNode.status && (
                  <div style={{ gridColumn: "span 2" }}>
                    <span style={{ color: "rgba(255,255,255,0.45)" }}>Status:</span>{" "}
                    <span className={`value status-${selectedNode.status.toLowerCase().replace(/_/g, "-")}`} style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "10px", background: "rgba(255,255,255,0.08)", textTransform: "uppercase" }}>
                      {selectedNode.status}
                    </span>
                  </div>
                )}
              </div>
            )}

            {selectedNode.type === "memory" && ((selectedNode.originalData as any).related?.length || (selectedNode.originalData as any).contradicts?.length || (selectedNode.originalData as any).supersedes?.length) && (
              <div className="drawer-relations" style={{ fontSize: "11px", margin: "12px 0" }}>
                <span style={{ color: "rgba(255,255,255,0.45)", display: "block", marginBottom: "4px" }}>Ontology Relations:</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                  {(selectedNode.originalData as any).related?.map((slug: string) => (
                    <span key={slug} style={{ color: "#a78bfa", background: "rgba(139,92,246,0.1)", padding: "1px 6px", borderRadius: "4px" }}>🔗 {slug}</span>
                  ))}
                  {(selectedNode.originalData as any).contradicts?.map((slug: string) => (
                    <span key={slug} style={{ color: "#ef4444", background: "rgba(239,68,68,0.1)", padding: "1px 6px", borderRadius: "4px" }}>⚠️ contradicts: {slug}</span>
                  ))}
                  {(selectedNode.originalData as any).supersedes?.map((slug: string) => (
                    <span key={slug} style={{ color: "#f59e0b", background: "rgba(245,158,11,0.1)", padding: "1px 6px", borderRadius: "4px" }}>✓ supersedes: {slug}</span>
                  ))}
                </div>
              </div>
            )}

            {selectedNode.type === "memory" ? (
              <div 
                className="drawer-markdown-content" 
                style={{ 
                  marginTop: 12, 
                  borderTop: '1px solid rgba(255,255,255,0.06)', 
                  paddingTop: 12,
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6',
                }}
              >
                {renderMarkdown((selectedNode.originalData as any).content || (selectedNode.originalData as any).body || selectedNode.excerpt || 'No content details available.')}
              </div>
            ) : (
              <p className="drawer-excerpt" style={{ whiteSpace: "pre-wrap" }}>{selectedNode.excerpt}</p>
            )}
          </div>
          <div className="drawer-footer">
            {selectedNode.type === "thread" && (
              <button 
                className="drawer-action-btn btn-cyan" 
                onClick={() => {
                  onOpenThread((selectedNode.originalData as any).id)
                  setSelectedNode(null)
                }}
              >
                Open Thread
              </button>
            )}
            {selectedNode.type === "memory" && (
              <button 
                className="drawer-action-btn btn-purple" 
                onClick={() => {
                  onGroundMemoryNode((selectedNode.originalData as any).slug)
                }}
              >
                {selectedGroundingNodes.includes((selectedNode.originalData as any).slug) 
                  ? "Remove Grounding Context" 
                  : "Ground Chat with Node"}
              </button>
            )}
            {selectedNode.type === "research" && (
              <div style={{ width: "100%", fontSize: 11, color: "rgba(255,255,255,0.4)", textAlign: "center", fontStyle: "italic", padding: "8px 0" }}>
                Background intelligence agent running...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
