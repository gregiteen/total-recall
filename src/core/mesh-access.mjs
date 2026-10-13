// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'mesh-access');
export const TAILSCALE_VARIANTS = owner.TAILSCALE_VARIANTS;
export const DEFAULT_SSH_PORT = owner.DEFAULT_SSH_PORT;
export const parseSshConfig = owner.parseSshConfig;
export const readSshConfig = owner.readSshConfig;
export const sshConfigMatchScore = owner.sshConfigMatchScore;
export const findSshConfigEntryForNode = owner.findSshConfigEntryForNode;
export const accessFromSshConfigEntry = owner.accessFromSshConfigEntry;
export const classifyTailscaleVariant = owner.classifyTailscaleVariant;
export const meshSshFromVariant = owner.meshSshFromVariant;
export const resolveNodeAccess = owner.resolveNodeAccess;
export const localIdentityFile = owner.localIdentityFile;
export const formatAccessTarget = owner.formatAccessTarget;
export const buildSshArgs = owner.buildSshArgs;
export const proposeAccessFromSshConfig = owner.proposeAccessFromSshConfig;
