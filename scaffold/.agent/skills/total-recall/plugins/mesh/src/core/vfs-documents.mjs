import { importHostModule } from '../host-runtime.mjs';
const hostModule = await importHostModule('src/core/vfs-documents.mjs');
export const { defaultVaultRoot, listVfsDocuments, listVfsDocumentsUnder, findVfsDocument, findVfsDocumentByType, findVfsDocumentByPath } = hostModule;
