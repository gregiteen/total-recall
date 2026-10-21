/**
 * The command map every compiled instruction surface leads with, so an agent
 * sees which CLI owns a job before it reaches for curl, sed or ssh. The plugin
 * namespaces and their operations are appended live by
 * `buildInstalledPluginsSummary`, so they cannot go stale.
 * `cli-quick-reference.spec.mjs` fails when a listed command stops existing in
 * `total-recall --help`.
 */
import { CLI_COMMANDS } from './cli-commands.mjs';
export const CLI_QUICK_REFERENCE_COMMANDS = Object.keys(CLI_COMMANDS);

export const CLI_QUICK_REFERENCE = `## TOTAL RECALL CLI — USE IT FOR EVERYTHING (run \`total-recall <command> --help\` before guessing)
- Built-in commands: ${CLI_QUICK_REFERENCE_COMMANDS.map(command => `\`${command}\``).join(' · ')}
- Memory: \`context "<task>" --action <a>\` · \`recall "<q>" --local\` · \`remember <category> "<text>" --global|--project\` · \`edit <slug>\` · \`compile\` · \`brief\` · \`status\` / \`doctor\`
- CREDENTIALS GO THROUGH THE AUTH PLUGIN ONLY (Total Recall has no native secrets store; never hand-roll curl/sed/ssh for keys): \`auth secret list|get <K>|set <K> --stdin|rotate <K> --stdin|--from-clipboard [--remote <t>]|rotate-auto <K>|rotation-due|shared|meta|catalog|audit|diff-env|export-env\`; remote targets: \`auth secret remote add|list|deploy <t> [--keys a,b] [--dry-run]\`. The store follows \`TR_SECRETS_BRAIN\`.
- Auth: \`auth status|audit|key list|issue|revoke|password set --stdin|passkey|google status\`
- Mesh nodes: \`mesh nodes|status|ping|exec <node> <cmd>|ssh <node> [cmd]|access <node>|leader\` — never ssh a machine into itself.
- Agents and work: \`agent spawn|list|logs|kill\` · \`harness dispatch|council\` · \`task <cmd>\` · \`plugin list|install|info|library\` · \`skill <cmd>\` · \`brain <cmd>\` · \`daemon <cmd>\` · \`update --all-brains --apply\`
- Every installed plugin namespace and its operations is listed next; run \`total-recall <namespace> --help\` for flags.
`;
