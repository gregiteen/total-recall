import type { PluginInfo } from '../../api/plugins'
import { pluginElements } from '../plugins/PluginPanel'

export function drawerPanels(plugin: PluginInfo) {
  return pluginElements(plugin).filter(item => item.kind !== 'settings')
}
