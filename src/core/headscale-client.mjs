// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'headscale-client');
export const headscaleUrlFromEnv = owner.headscaleUrlFromEnv;
export const assertSecureControlUrl = owner.assertSecureControlUrl;
export const normalizeControlUrl = owner.normalizeControlUrl;
export const findHeadscaleKeyMeta = owner.findHeadscaleKeyMeta;
export const resolveHeadscaleConfig = owner.resolveHeadscaleConfig;
export const describeHeadscaleAvailability = owner.describeHeadscaleAvailability;
export const headscaleFetch = owner.headscaleFetch;
export const headscaleFetchWithLegacyFallback = owner.headscaleFetchWithLegacyFallback;
export const resolveHeadscaleUser = owner.resolveHeadscaleUser;
export const createHeadscalePreAuthKey = owner.createHeadscalePreAuthKey;
export const getHeadscalePolicy = owner.getHeadscalePolicy;
export const setHeadscalePolicy = owner.setHeadscalePolicy;
export const buildMeshSshPolicy = owner.buildMeshSshPolicy;
