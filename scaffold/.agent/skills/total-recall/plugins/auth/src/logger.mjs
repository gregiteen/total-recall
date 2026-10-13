import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/logger.mjs');
export const { logEvents, logger, LOG_DIR, getLogFile } = hostModule;
