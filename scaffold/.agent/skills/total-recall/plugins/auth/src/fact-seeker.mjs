import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/fact-seeker.mjs');
export const { getLocalizedDateTime, formatBeautifulDate, loadAgenda, addToAgenda, CANCELLED_STATUS, cancelBogusAgendaTopics, reclassifyCancelledAgendaTopics, markTopicResearched, getNextAgendaTopic, inferTopicsFromSession, buildMultiNoteGraph, runSelfDiagnosis, runKnowledgeAcquisitionCycle, ingestSessionTopics, runResearchDeliberationCycle, runResearchImprovementCycle, runMemoryCompaction } = hostModule;
