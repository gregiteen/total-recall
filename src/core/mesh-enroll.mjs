// Compatibility bindings only; implementation is owned by the installed plugin.
import { loadPluginModule, unavailablePluginOperation } from './plugin-runtime.mjs';
const owner = await loadPluginModule('mesh', 'mesh-enroll');
export const ENROLLMENT_STATES = owner.ENROLLMENT_STATES;
export const resetAutoEnrollThrottle = owner.resetAutoEnrollThrottle;
export const supportsTailscaleSsh = owner.supportsTailscaleSsh;
export const readTailscaleStatus = owner.readTailscaleStatus;
export const readTailscalePrefs = owner.readTailscalePrefs;
export const resolveLoginServer = owner.resolveLoginServer;
export const getEnrollmentStatus = owner.getEnrollmentStatus;
export const autoEnrollEnabled = owner.autoEnrollEnabled;
export const buildUpArgs = owner.buildUpArgs;
export const isIncompleteSettingsError = owner.isIncompleteSettingsError;
export const requestInteractiveAuthUrl = owner.requestInteractiveAuthUrl;
export const enrollThisNode = owner.enrollThisNode;
export const ensureEnrolled = owner.ensureEnrolled;
export const resolveTailscaleBinary = owner.resolveTailscaleBinary;
