import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/research-queue.mjs');
export const { compileResearchProjectSummary, syncResearchProjectNode, loadQueue, saveQueue, listQueue, RESEARCH_ORIGINS, RESEARCH_VIAS, normalizeTopic, addToQueue, updateQueueItem, removeFromQueue } = hostModule;
