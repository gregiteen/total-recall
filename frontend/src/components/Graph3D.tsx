/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import type { MemoryNode, ResearchItem } from "../types"
import type { ChatThread } from "../api"
import ForceGraph3D from "react-force-graph-3d"
import * as THREE from "three"

interface Graph3DProps {
  threads: ChatThread[]
  memoryNodes: MemoryNode[]
  researchItems: ResearchItem[]
  onOpenThread: (threadId: string) => void
  onGroundMemoryNode: (slug: string) => void
  selectedGroundingNodes: string[]
  interactive?: boolean
}

// ─── THREE.JS CACHING (Crucial for RAM Optimization) ───────────
// Shared geometry with much lower poly count (16x16 instead of 32x32)
const sharedGeometry = new THREE.SphereGeometry(1, 16, 16);
const sharedRingGeometry = new THREE.TorusGeometry(1, 0.1, 8, 32);
const materialCache = new Map<string, THREE.Material>();

function getSharedMaterial(color: string, isRing = false) {
  const key = `${color}-${isRing}`;
  if (!materialCache.has(key)) {
    if (isRing) {
      materialCache.set(key, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 }));
    } else {
      materialCache.set(key, new THREE.MeshLambertMaterial({ 
        color,
        transparent: true,
        opacity: 0.9,
      }));
    }
  }
  return materialCache.get(key)!;
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
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hoverNode, setHoverNode] = useState<any>(null);
  
  const [visibleTypes, setVisibleTypes] = useState({
    research: true,
    observations: true,
    rules: true,
    threads: false,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];

    // Pre-allocate maps for O(1) lookups to prevent CPU blocking
    const nodeMapById = new Map<string, any>();
    const nodeMapBySlug = new Map<string, any>();
    const nodeMapByTitle = new Map<string, any>();
    const nodesByCategory = new Map<string, any[]>();

    if (visibleTypes.threads) {
      threads.forEach(t => {
        const node = {
          id: `thread-${t.id}`,
          type: 'thread',
          title: t.title || 'Untitled Thread',
          subtitle: `${t.turns} ${t.turns === 1 ? 'turn' : 'turns'}`,
          originalData: t,
        };
        nodes.push(node);
        nodeMapById.set(node.id, node);
      });
    }

    memoryNodes.forEach((m) => {
      const category = (m.category || 'general').toLowerCase()
      const isRule = ['invariants', 'preferences', 'patterns', 'anti-patterns'].includes(category)
      if (isRule) {
        if (!visibleTypes.rules) return
      } else {
        if (!visibleTypes.observations) return
      }

      const node = {
        id: `memory-${m.slug}`,
        type: 'memory',
        title: m.title || m.slug,
        subtitle: `Memory Node • ${m.category || 'general'}`,
        category: category,
        originalData: m,
      };
      
      nodes.push(node);
      nodeMapById.set(node.id, node);
      
      const slugKey = m.slug?.toLowerCase();
      const titleKey = m.title?.toLowerCase();
      if (slugKey) nodeMapBySlug.set(slugKey, node);
      if (titleKey) nodeMapByTitle.set(titleKey, node);
      
      if (!nodesByCategory.has(category)) nodesByCategory.set(category, []);
      nodesByCategory.get(category)!.push(node);
    })

    if (visibleTypes.research) {
      researchItems.forEach((r) => {
        const node = {
          id: `research-${r.id}`,
          type: 'research',
          title: r.topic,
          subtitle: `Research Topic • ${r.priority} priority`,
          originalData: r,
        };
        nodes.push(node);
        nodeMapById.set(node.id, node);
      })
    }

    // Fast Link Generation
    nodes.forEach((nodeA) => {
      if (nodeA.type === "research") {
        const rItem = nodeA.originalData as ResearchItem;
        if (rItem.node_slug) {
          const targetId = `memory-${rItem.node_slug}`;
          if (nodeMapById.has(targetId)) {
            links.push({ source: nodeA.id, target: targetId, type: 'research', colorHex: "#fbbf24" });
          }
        }
      }

      if (nodeA.type === "memory") {
        const memA = nodeA.originalData as MemoryNode;
        
        // Explicit YAML Links
        ['related', 'contradicts', 'supersedes'].forEach(relType => {
          const items = (memA as any)[relType];
          if (Array.isArray(items)) {
            const color = relType === 'contradicts' ? '#ef4444' : relType === 'supersedes' ? '#f59e0b' : '#60a5fa';
            items.forEach(slug => {
              const targetId = `memory-${slug}`;
              if (nodeMapById.has(targetId)) {
                links.push({ source: nodeA.id, target: targetId, type: relType, colorHex: color });
              }
            });
          }
        });

        // Implicit Category Links (max 2 per node to avoid visual mess)
        const sameCategory = nodesByCategory.get(nodeA.category) || [];
        let categoryLinksAdded = 0;
        for (let j = 0; j < sameCategory.length && categoryLinksAdded < 2; j++) {
          const nodeB = sameCategory[j];
          if (nodeB.id !== nodeA.id && nodeB.id > nodeA.id) { // Ensure unidirectional to avoid dupes
            links.push({ source: nodeA.id, target: nodeB.id, type: 'implicit', colorHex: '#475569' });
            categoryLinksAdded++;
          }
        }

        // ─── OPENWIKI LINK EXTRACTION (Optimized O(1) lookups) ───
        const bodyContent = memA.body || memA.content || '';
        
        const wikiMatches = bodyContent.match(/\[\[(.*?)\]\]/g) || [];
        wikiMatches.forEach(match => {
          const inner = match.slice(2, -2);
          const slugOrTitle = inner.split('|').pop()?.trim().toLowerCase();
          if (slugOrTitle) {
            const target = nodeMapBySlug.get(slugOrTitle) || nodeMapByTitle.get(slugOrTitle);
            if (target && target.id !== nodeA.id) {
               links.push({ source: nodeA.id, target: target.id, type: 'openwiki', colorHex: '#a78bfa' });
            }
          }
        });

        const mdMatches = Array.from(bodyContent.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g));
        mdMatches.forEach(match => {
          const slug = match[2]?.trim().toLowerCase();
          if (slug && !slug.startsWith('http')) {
            const target = nodeMapBySlug.get(slug);
            if (target && target.id !== nodeA.id) {
               links.push({ source: nodeA.id, target: target.id, type: 'openwiki', colorHex: '#a78bfa' });
            }
          }
        });
      }
    });

    const nodeDegrees: Record<string, number> = {};
    links.forEach(l => {
      nodeDegrees[l.source] = (nodeDegrees[l.source] || 0) + 1;
      nodeDegrees[l.target] = (nodeDegrees[l.target] || 0) + 1;
    });

    nodes.forEach(n => {
      n.val = Math.max(2, Math.min(10, Math.sqrt(nodeDegrees[n.id] || 0) + 1.5));
      n.neighbors = new Set();
      
      if (n.type === 'memory') {
        const palette: Record<string, string> = {
            invariants: "#38bdf8",
            preferences: "#818cf8",
            patterns: "#34d399",
            "anti-patterns": "#f87171",
            facts: "#60a5fa",
            concepts: "#a78bfa",
            decisions: "#fbbf24",
            lore: "#c084fc",
            corrections: "#fb923c",
        };
        n.color = palette[n.category] || "#60a5fa";
        if (['invariants', 'preferences', 'patterns', 'anti-patterns'].includes(n.category)) {
            if (!palette[n.category]) n.color = "#818cf8";
        }
      } else if (n.type === 'thread') {
        n.color = "#22d3ee";
      } else if (n.type === 'research') {
        n.color = "#fbbf24";
      }
    });

    links.forEach(l => {
      const src = nodeMapById.get(l.source);
      const tgt = nodeMapById.get(l.target);
      if (src && tgt) {
        src.neighbors.add(tgt.id);
        tgt.neighbors.add(src.id);
      }
    });

    return { nodes, links };
  }, [threads, memoryNodes, researchItems, visibleTypes]);

  useEffect(() => {
    if (fgRef.current && dimensions.width > 0) {
      setTimeout(() => {
        fgRef.current.zoomToFit(600, 50);
      }, 800);
    }
  }, [graphData, dimensions]);

  useEffect(() => {
    // Highly optimized opacity mutation
    graphData.nodes.forEach(node => {
      if (node.__threeObj && node.__threeObj.userData.isCustomNode) {
        const isFocus = !hoverNode || node === hoverNode || (hoverNode.neighbors && hoverNode.neighbors.has(node.id));
        // Mutate clone of material to prevent shared material bleeding if hovered
        const mesh = node.__threeObj.children[0];
        if (mesh) {
            if (isFocus) {
                // Restore shared material
                mesh.material = getSharedMaterial(node.color);
            } else {
                // Use a dim material
                if (!mesh.userData.dimMaterial) {
                    mesh.userData.dimMaterial = new THREE.MeshBasicMaterial({ color: node.color, transparent: true, opacity: 0.05 });
                }
                mesh.material = mesh.userData.dimMaterial;
            }
        }
      }
    });
  }, [hoverNode, graphData]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-150);
      fgRef.current.d3Force('link').distance((link: any) => link.type === 'implicit' ? 40 : 80);
      fgRef.current.d3Force('collide', (window as any).d3?.forceCollide?.((node: any) => node.val * 2 + 3));
    }
  }, [graphData]);

  const handleNodeClick = useCallback((node: any) => {
    if (!interactive) return;
    const distance = 90;
    const hyp = Math.hypot(node.x, node.y, node.z);
    const safeHyp = hyp < 0.1 ? 0.1 : hyp;
    const distRatio = 1 + distance / safeHyp;
    fgRef.current?.cameraPosition(
      { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
      node, 
      1500 
    );
    if (node.type === 'memory') {
      onGroundMemoryNode(node.originalData.slug);
    } else if (node.type === 'thread') {
      onOpenThread(node.originalData.id);
    }
  }, [interactive, onGroundMemoryNode, onOpenThread]);

  const nodeThreeObject = useCallback((node: any) => {
    const group = new THREE.Group();
    group.userData.isCustomNode = true;
    
    // Use shared geometry and material
    const material = getSharedMaterial(node.color);
    const sphere = new THREE.Mesh(sharedGeometry, material);
    
    // Scale instead of creating new geometry
    const scale = node.val * 1.8;
    sphere.scale.set(scale, scale, scale);
    group.add(sphere);

    // Selected Outline
    if (selectedGroundingNodes.includes(node.originalData?.slug)) {
      const ringMat = getSharedMaterial('#ffffff', true);
      const ring = new THREE.Mesh(sharedRingGeometry, ringMat);
      
      const ringScale = scale + 1.2;
      ring.scale.set(ringScale, ringScale, ringScale);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    return group;
  }, [selectedGroundingNodes]);

  const getLinkColor = useCallback((link: any) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    const isFocus = !hoverNode || srcId === hoverNode?.id || tgtId === hoverNode?.id;
    
    const hex = link.colorHex || '#475569';
    let r = parseInt(hex.slice(1, 3), 16) || 71;
    let g = parseInt(hex.slice(3, 5), 16) || 85;
    let b = parseInt(hex.slice(5, 7), 16) || 105;
    
    const baseOpacity = link.type === 'implicit' ? 0.2 : 0.6;
    const opacity = isFocus ? baseOpacity : 0.02;
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }, [hoverNode]);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: 'radial-gradient(circle at center, #0a0f1d 0%, #03050a 100%)' }}>
      {dimensions.width > 0 && (
      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        nodeLabel={(node: any) => `<div style="background: rgba(10, 15, 30, 0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: var(--font-sans, system-ui); max-width: 250px;">
          <strong style="color: #fff; font-size: 14px; display: block; margin-bottom: 2px;">${node.title}</strong>
          <span style="color: #94a3b8; font-size: 12px; display: block;">${node.subtitle}</span>
        </div>`}
        enableNodeDrag={interactive}
        enableNavigationControls={interactive}
        onNodeClick={handleNodeClick}
        onNodeHover={(node: any) => {
           setHoverNode(node || null);
           if (containerRef.current) containerRef.current.style.cursor = node ? 'pointer' : 'default';
        }}
        linkColor={getLinkColor}
        linkWidth={link => (link.type === 'implicit' ? 0.5 : 1.5)}
        linkDirectionalParticles={link => link.type !== 'implicit' ? 2 : 0}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleSpeed={0.005}
        backgroundColor="rgba(0,0,0,0)"
        d3VelocityDecay={0.3}
      />
      )}
      
      {/* HUD OVERLAY CODE REMAINS UNCHANGED */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 30, pointerEvents: 'none' }}>
        <h3 style={{ margin: 0, fontSize: 20, color: '#f8fafc', fontWeight: 600, letterSpacing: '-0.02em', textShadow: '0 2px 10px rgba(0,0,0,0.5)' }}>Constellation</h3>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'rgba(148,163,184,0.9)', textShadow: '0 1px 4px rgba(0,0,0,0.5)' }}>Interactive Knowledge Network</p>
      </div>

      {interactive && (
      <div style={{ position: 'absolute', top: 80, left: 20, display: 'flex', flexDirection: 'column', gap: 12, background: 'rgba(15, 20, 35, 0.4)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', padding: '16px 20px', borderRadius: 16, border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 12px 40px rgba(0,0,0,0.3)', width: 240, zIndex: 60, pointerEvents: 'auto', transition: 'all 0.3s ease' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#cbd5e1', textTransform: 'uppercase', letterSpacing: 1.2 }}>Filters</span>
          <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 6, color: '#94a3b8' }}>{graphData.nodes.length} items</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={visibleTypes.research} onChange={() => setVisibleTypes(prev => ({ ...prev, research: !prev.research }))} style={{ accentColor: '#fbbf24', cursor: 'pointer' }} />
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#fbbf24', boxShadow: '0 0 8px rgba(251,191,36,0.6)' }} />
            <span style={{ flex: 1 }}>Research</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={visibleTypes.observations} onChange={() => setVisibleTypes(prev => ({ ...prev, observations: !prev.observations }))} style={{ accentColor: '#60a5fa', cursor: 'pointer' }} />
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#60a5fa', boxShadow: '0 0 8px rgba(96,165,250,0.6)' }} />
            <span style={{ flex: 1 }}>Memory</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={visibleTypes.rules} onChange={() => setVisibleTypes(prev => ({ ...prev, rules: !prev.rules }))} style={{ accentColor: '#38bdf8', cursor: 'pointer' }} />
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'linear-gradient(135deg,#38bdf8,#f87171)', boxShadow: '0 0 8px rgba(56,189,248,0.5)' }} />
            <span style={{ flex: 1 }}>Rules</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#e2e8f0', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={visibleTypes.threads} onChange={() => setVisibleTypes(prev => ({ ...prev, threads: !prev.threads }))} style={{ accentColor: '#22d3ee', cursor: 'pointer' }} />
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,0.6)' }} />
            <span style={{ flex: 1 }}>Sessions</span>
          </label>
        </div>
      </div>
      )}
    </div>
  )
}
