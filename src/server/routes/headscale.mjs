// Compatibility import only; the public host loads declared plugin entrypoints.
import { loadPluginModule } from '../../core/plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'route-headscale');
export default owner.default;
