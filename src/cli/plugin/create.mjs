import fs from "node:fs";
import path from "node:path";
import { validatePluginManifest, projectPluginsDir, globalPluginsDir } from "../../core/plugin-loader.mjs";

function toTitleCase(kebab) {
  return kebab
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export async function createPlugin(args = []) {
  const isGlobal = args.includes("--global") || args.includes("-g");
  const withCli = args.includes("--with-cli");
  const withGenerator = args.includes("--with-generator");

  let name = null;
  let description = null;
  let category = null;
  const useCases = [];

  const cleanArgs = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--global" || arg === "-g" || arg === "--with-cli" || arg === "--with-generator") {
      continue;
    }
    if (arg === "--name" && args[i + 1]) {
      name = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--description" && args[i + 1]) {
      description = args[i + 1];
      i++;
      continue;
    }
    if (arg === "--use-case" && args[i + 1]) {
      useCases.push(args[i + 1]);
      i++;
      continue;
    }
    if (arg === "--category" && args[i + 1]) {
      category = args[i + 1];
      i++;
      continue;
    }
    cleanArgs.push(arg);
  }

  const id = cleanArgs[0];
  if (!id) {
    console.error("❌ Error: Missing plugin id.");
    console.error("   Usage: total-recall plugin create <id> [--name <name>] [--description <desc>] [--category <cat>] [--use-case <use>] [--with-cli] [--with-generator] [--global]\n");
    process.exit(1);
  }

  const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;
  if (!ID_PATTERN.test(id)) {
    console.error(`❌ Error: Invalid plugin id "${id}". Must be lowercase kebab-case (^[a-z][a-z0-9-]{1,63}$)`);
    process.exit(1);
  }

  const pluginsBaseDir = isGlobal ? globalPluginsDir() : projectPluginsDir(process.cwd());

  const pluginDir = path.join(pluginsBaseDir, id);
  if (fs.existsSync(pluginDir)) {
    console.error(`❌ Error: Plugin directory already exists at ${pluginDir}`);
    process.exit(1);
  }

  fs.mkdirSync(pluginDir, { recursive: true });

  const pluginName = name || toTitleCase(id);
  const pluginDesc = description || `${pluginName} extension for Total Recall AI OS`;

  const manifest = {
    $schema: "https://github.com/total-recall/total-recall/blob/main/metadata.plugin.schema.json",
    id,
    name: pluginName,
    version: "1.0.0",
    description: pluginDesc,
    license: "MIT"
  };
  if (useCases.length > 0) manifest.use_cases = useCases;

  if (category) {
    manifest.ssss_schemas = {
      categories: [
        {
          name: category,
          description: `Custom ${category} memory nodes for ${pluginName}`,
          node_type: "memory"
        }
      ]
    };
  }

  if (withCli) {
    manifest.cli = {
      command: id,
      handler: "./cli.mjs",
      subcommands: [
        { name: "status", description: `Show ${pluginName} status` }
      ]
    };

    const cliContent = `#!/usr/bin/env node
export async function run(argv = []) {
  // argv: ["node", "total-recall", "<command>", "<subcommand>", ...args]
  const sub = (Array.isArray(argv) ? argv[3] : null) || "status";
  console.log(\`${pluginName}: \${sub}\`);
}
export default run;
`;
    fs.writeFileSync(path.join(pluginDir, "cli.mjs"), cliContent, "utf8");
  }

  if (withGenerator) {
    manifest.compile = {
      generator: "./generator.mjs",
      auto: true
    };

    const generatorContent = `/**
 * Context generator for ${pluginName}.
 * Invoked during evolving context compilation.
 */
export async function generateContext({ nodes = [], manifest = {} }) {
  const categories = (manifest.ssss_schemas?.categories || []).map((c) => c.name);
  const mine = nodes.filter((n) => categories.includes(n.category) && n.status === 'active');
  if (mine.length === 0) return '';
  return \`#### ${pluginName}\n\` + mine.map((n) => \`- \${n.title || n.slug}\`).join('\\n') + '\\n';
}
export default generateContext;
`;
    fs.writeFileSync(path.join(pluginDir, "generator.mjs"), generatorContent, "utf8");
  }


  const validation = validatePluginManifest(manifest);
  if (!validation.valid) {
    console.error("❌ Validation failed for generated manifest:", validation.errors);
    fs.rmSync(pluginDir, { recursive: true, force: true });
    process.exit(1);
  }

  fs.writeFileSync(
    path.join(pluginDir, "plugin.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  const lines = [
    `# ${pluginName}`,
    "",
    `> ${pluginDesc}`,
    "",
    "## Sharing",
    "",
    "Offer it to your other Total Recall nodes over the mesh:",
    "",
    "```bash",
    `npx total-recall plugin share ${id}`,
    "```",
    "",
    "Peers install it with `npx total-recall plugin install peer:<this-node>/" + id + "`.",
    "",
    "## Features",
    "",
    `- **Identifier**: \`${id}\``,
    "- **Version**: 1.0.0"
  ];
  if (useCases.length) lines.push(`- **Use cases**: ${useCases.join(", ")}`);
  if (category) lines.push(`- **SSSS Category**: \`${category}\``);
  if (withCli) lines.push(`- **CLI Command**: \`npx total-recall ${id}\``);
  lines.push("");

  fs.writeFileSync(path.join(pluginDir, "README.md"), lines.join("\n"), "utf8");

  console.log(`\n🎉 Successfully scaffolded plugin "${pluginName}"!`);
  console.log(`   Location: \x1b[36m${pluginDir}\x1b[0m`);
  console.log(`   Manifest: \x1b[33m${path.join(pluginDir, "plugin.json")}\x1b[0m`);
  if (withCli) {
    console.log(`   CLI Handler: \x1b[32m${path.join(pluginDir, "cli.mjs")}\x1b[0m`);
  }
  console.log(`\nNext steps:`);
  console.log(`   Inspect: \x1b[32mnpx total-recall plugin info ${id}\x1b[0m`);
  console.log(`   List:    \x1b[32mnpx total-recall plugin list\x1b[0m\n`);
}
