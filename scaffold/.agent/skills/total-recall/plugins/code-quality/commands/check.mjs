import { runCore } from './run-core.mjs';

/** total-recall code-quality-check [--tier fast|full|remote] [--only <id>] */
export default function check(args = []) {
  return runCore('check.mjs', args);
}
