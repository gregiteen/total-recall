import { scaffoldProject } from '../capability/index.mjs';
import toolchain from '../capability/toolchain.cjs';

export function scaffoldProjectForHost({ withTotalRecall = true, ...options }) {
  return scaffoldProject({
    ...options,
    generate: args => toolchain.runCanonical(withTotalRecall ? [...args, '--with-total-recall'] : args),
  });
}
