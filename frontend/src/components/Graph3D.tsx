import { useState, useEffect, useRef, useMemo } from "react"
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, WheelEvent as ReactWheelEvent } from "react"
import type { MemoryNode, ResearchItem } from "../types"
import type { ChatThread } from "../api"

interface Graph3DProps {
  threads: ChatThread[]
  memoryNodes: MemoryNode[]
  researchItems: ResearchItem[]
  onOpenThread: (threadId: string) => void
  onGroundMemoryNode: (slug: string) => void
  selectedGroundingNodes: string[]
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
}: Graph3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Projection configuration state
  const [zoom, setZoom] = useState<number>(1.2)
  const [selectedNode, setSelectedNode] = useState<VisualNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<VisualNode | null>(null)
  const [dragging, setDragging] = useState<boolean>(false)

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

    // 2. Memory nodes
    memoryNodes.forEach((m) => {
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
  }, [threads, memoryNodes, researchItems])

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
                color: "rgba(167, 139, 250, 0.55)"
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
          ctx.strokeStyle = color || (source.type === "memory" ? "rgba(139, 92, 246, 0.65)" : source.type === "thread" ? "rgba(6, 182, 212, 0.65)" : "rgba(245, 158, 11, 0.65)")
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

        let color = "#8b5cf6" // memory nodes (purple)
        let glowColor = "rgba(139, 92, 246, 0.2)"
        if (node.type === "thread") {
          color = "#06b6d4" // thread nodes (cyan)
          glowColor = "rgba(6, 182, 212, 0.2)"
        } else if (node.type === "research") {
          color = "#f59e0b" // research nodes (gold)
          glowColor = "rgba(245, 158, 11, 0.2)"
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
    <div className="graph-3d-wrapper" ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: 'radial-gradient(circle at center, #0b0f19 0%, #030712 100%)', overflow: 'hidden' }}>
      
      {/* 3D Projection Canvas */}
      <canvas
        ref={canvasRef}
        onMouseDown={(e) => handleStartDrag(e.clientX, e.clientY)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleEndDrag}
        onMouseLeave={handleEndDrag}
        onClick={handleCanvasClick}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleEndDrag}
        style={{ cursor: dragging ? "grabbing" : hoveredNode ? "pointer" : "grab", display: "block" }}
      />

      {/* Cosmic Floating Background Dust overlay */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 60%)' }} />

      {/* Floating UI Elements */}
      <div style={{ position: 'absolute', top: 20, left: 20, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
        <h3 style={{ margin: 0, fontSize: 18, color: '#fff', fontWeight: 700, letterSpacing: '0.5px' }}>Sovereign Mind Matrix</h3>
        <p style={{ margin: 0, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>3D Constellation of Research, Memory & Conversations</p>
      </div>

      {/* Controls Overlay */}
      <div style={{ position: 'absolute', bottom: 20, left: 20, display: 'flex', gap: 8 }}>
        <button 
          onClick={() => setZoom(prev => Math.min(3.0, prev + 0.2))} 
          style={{ width: 32, height: 32, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Zoom In"
        >
          ＋
        </button>
        <button 
          onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))} 
          style={{ width: 32, height: 32, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Zoom Out"
        >
          －
        </button>
        <button 
          onClick={() => { angleX.current = 0.3; angleY.current = 0.5; setZoom(1.2) }} 
          style={{ width: 32, height: 32, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Reset Camera"
        >
          ⟲
        </button>
      </div>

      <div style={{ position: 'absolute', top: 20, right: 20, display: 'flex', gap: 12, fontSize: 11, background: 'rgba(15,23,42,0.65)', padding: '6px 12px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)' }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6' }} /> Memory ({memoryNodes.length})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)' }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#06b6d4' }} /> Threads ({threads.length})
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)' }}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#f59e0b' }} /> Research ({researchItems.length})
        </div>
      </div>

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

            <p className="drawer-excerpt" style={{ whiteSpace: "pre-wrap" }}>{selectedNode.excerpt}</p>
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
