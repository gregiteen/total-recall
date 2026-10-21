import { runCore } from './run-core.mjs';

/** total-recall code-quality-report [summary|errors|raw <id>|…] */
export default function report(args = []) {
  return runCore('report.mjs', args);
}
