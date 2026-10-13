// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'tailscale-cli');
export const FALLBACK_BINARIES = owner.FALLBACK_BINARIES;
export const DARWIN_DAEMON_BINARIES = owner.DARWIN_DAEMON_BINARIES;
export const STATUS_TIMEOUT_MS = owner.STATUS_TIMEOUT_MS;
export const resolveTailscaleBinary = owner.resolveTailscaleBinary;
export const hasTailscaleDaemon = owner.hasTailscaleDaemon;
