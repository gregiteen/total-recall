import type { PluginInfo } from "../../../api/plugins";
import type { Card } from "../card/contract";
import { PluginPanel, pluginElements } from "../PluginPanel";

export interface WorkspaceHostProps {
  plugin: PluginInfo;
  card: Card;
}

/**
 * Workspaces are owner-supplied interfaces, never product implementations in core.
 */
export function WorkspaceHost({ plugin, card }: WorkspaceHostProps) {
  const component = card.workspace?.component;
  const element = pluginElements(plugin).find(item => item.id === component || item.tag === component);
  if (!element) return <p role="status">This plugin has not supplied its workspace interface yet.</p>;
  if (card.workspace?.permissions?.length) {
    // An opaque frame cannot safely gain microphone access by adding allow-same-origin.
    // Keep isolation intact until a dedicated device-capability bridge is available.
    return <p role="status">This workspace requires device access that the host does not support yet.</p>;
  }
  return <PluginPanel plugin={plugin} elementId={element.id} />;
}
