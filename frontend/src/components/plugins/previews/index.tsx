/**
 * Interactive Preview Registry
 *
 * Maps each capability plugin ID to its preview component.
 * The PluginsPage detail drawer uses this map to render the
 * correct interactive mockup for the selected plugin.
 */

import { PhonePreview } from "./PhonePreview"
import { SigningPreview } from "./SigningPreview"
import { DomainsPreview } from "./DomainsPreview"
import { DesignPreview } from "./DesignPreview"
import { TextPreview } from "./TextPreview"
import { CodeQualityPreview } from "./CodeQualityPreview"
import { ComposableCliPreview } from "./ComposableCliPreview"
import { DecisionPreview } from "./DecisionPreview"
import { ImageGeneratorPreview } from "./ImageGeneratorPreview"
import { UserAutomationsPreview } from "./UserAutomationsPreview"
import type { FC } from "react"

/**
 * Map of plugin IDs to their preview component factories.
 *
 * The key is the short plugin identifier (the `id` field in manifest).
 * A plugin that has no registered preview falls through to the
 * generic fallback renderer.
 */
export const previewRegistry: Record<string, FC> = {
  "tr-plugin-phone": PhonePreview,
  "phone": PhonePreview,
  "tr-plugin-signing": SigningPreview,
  "signing": SigningPreview,
  "tr-plugin-domains": DomainsPreview,
  "domains": DomainsPreview,
  "tr-plugin-design": DesignPreview,
  "design": DesignPreview,
  "tr-plugin-text": TextPreview,
  "text": TextPreview,
  "tr-plugin-code-quality": CodeQualityPreview,
  "code-quality": CodeQualityPreview,
  "tr-plugin-composable-cli": ComposableCliPreview,
  "composable-cli": ComposableCliPreview,
  "tr-plugin-decision": DecisionPreview,
  "decision": DecisionPreview,
  "image-generator": ImageGeneratorPreview,
  "tr-plugin-image-generator": ImageGeneratorPreview,
  "user-automations": UserAutomationsPreview,
}

/**
 * Retrieve the matching preview component for a given plugin id.
 * Supports both the full tr-plugin-XXXX id and the short name.
 *
 * @param pluginId The plugin's id field from its manifest
 * @returns A React component, or null if no preview is registered
 */
export function getPreviewComponent(pluginId: string): FC | null {
  if (!pluginId) return null
  return previewRegistry[pluginId] || null
}

/**
 * Generic fallback renderer for plugins that have no registered preview.
 * Displays a placeholder card with the plugin id.
 */
export function PreviewFallback({ pluginId }: { pluginId: string }) {
  return (
    <div
      style={{
        background: "linear-gradient(135deg, #0a1628, #1a1a2e)",
        borderRadius: "12px",
        padding: "40px 24px",
        textAlign: "center" as const,
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        color: "#888",
      }}
    >
      <div style={{ fontSize: "32px", marginBottom: "12px", opacity: 0.4 }}>🧩</div>
      <div style={{ fontSize: "14px", fontWeight: 600, color: "#aaa", marginBottom: "6px" }}>
        No Preview Available
      </div>
      <div style={{ fontSize: "12px", color: "#666" }}>
        Plugin <span style={{ color: "#888", fontFamily: "var(--font-mono)" }}>{pluginId}</span> has
        not registered an interactive preview component yet.
      </div>
    </div>
  )
}
