import { useMemo, useState } from 'react';
import type { MeshNode, LeaderInfo } from '../api/mesh';

interface MeshTopologyProps {
  nodes: MeshNode[];
  leader: LeaderInfo | null;
  latencyMs?: Record<string, number | null>;
  onSelectNode?: (node: MeshNode) => void;
  selectedHostname?: string | null;
}

/**
 * Lightweight SVG mesh topology — circular layout of nodes with leader highlight.
 */
export function MeshTopology({
  nodes,
  leader,
  latencyMs = {},
  onSelectNode,
  selectedHostname,
}: MeshTopologyProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const layout = useMemo(() => {
    const n = nodes.length;
    if (n === 0) return [];
    const cx = 200;
    const cy = 160;
    const r = n === 1 ? 0 : 100;
    return nodes.map((node, i) => {
      const angle = n === 1 ? 0 : (2 * Math.PI * i) / n - Math.PI / 2;
      return {
        ...node,
        x: cx + r * Math.cos(angle),
        y: cy + r * Math.sin(angle),
      };
    });
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <div className="mesh-topology empty" data-testid="mesh-topology">
        <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>
          No mesh nodes to display
        </p>
      </div>
    );
  }

  return (
    <div className="mesh-topology" data-testid="mesh-topology">
      <svg viewBox="0 0 400 320" width="100%" height="320" role="img" aria-label="Mesh topology">
        {/* Edges between every pair (light) */}
        {layout.map((a, i) =>
          layout.slice(i + 1).map((b) => (
            <line
              key={`${a.hostname}-${b.hostname}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={0.6}
            />
          )),
        )}
        {layout.map((node) => {
          const isLeader = node.hostname === leader?.hostname || node.ip === leader?.ip;
          const isSelected = selectedHostname === node.hostname;
          const isHovered = hovered === node.hostname;
          const lat = latencyMs[node.hostname];
          const fill = !node.online
            ? 'var(--error)'
            : isLeader
              ? 'var(--accent-hover)'
              : 'var(--accent)';
          return (
            <g
              key={node.hostname}
              transform={`translate(${node.x},${node.y})`}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectNode?.(node)}
              onMouseEnter={() => setHovered(node.hostname)}
              onMouseLeave={() => setHovered(null)}
              data-testid={`mesh-node-${node.hostname}`}
            >
              <circle
                r={isSelected || isHovered ? 22 : 18}
                fill={fill}
                opacity={node.online ? 1 : 0.45}
                stroke={isSelected ? 'var(--text)' : 'transparent'}
                strokeWidth={2}
              />
              <text
                y={36}
                textAnchor="middle"
                fontSize={11}
                fill="var(--text)"
                style={{ pointerEvents: 'none' }}
              >
                {node.hostname?.split('.')[0] || node.ip}
              </text>
              {lat != null && !node.self && (
                <text
                  y={-28}
                  textAnchor="middle"
                  fontSize={10}
                  fill="var(--text-secondary)"
                  style={{ pointerEvents: 'none' }}
                >
                  {lat}ms
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
