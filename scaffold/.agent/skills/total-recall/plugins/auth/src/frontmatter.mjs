import { importHostModule } from './host-runtime.mjs';
const hostModule = await importHostModule('src/core/frontmatter.mjs');
export default hostModule.default;
