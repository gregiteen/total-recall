import { CURATED_CATALOG } from "../../server/routes/plugins.mjs";

export async function searchCatalog(args = []) {
  const isJson = args.includes("--json");
  const cleanArgs = args.filter(a => a !== "--json");
  const query = cleanArgs.join(" ").toLowerCase().trim();

  let results = CURATED_CATALOG;
  if (query) {
    results = CURATED_CATALOG.filter(p =>
      p.id.toLowerCase().includes(query) ||
      p.name.toLowerCase().includes(query) ||
      p.description.toLowerCase().includes(query) ||
      p.tags.some(t => t.toLowerCase().includes(query))
    );
  }

  if (isJson) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log("\n🔌 Total Recall — Plugin Catalog & Discovery\n");
  if (results.length === 0) {
    console.log("No plugins found matching \"" + query + "\".\n");
    return;
  }

  for (const p of results) {
    const verifiedBadge = p.verified ? " [Verified]" : "";
    console.log("\x1b[1;36m● " + p.name + "\x1b[0m (id: \x1b[33m" + p.id + "\x1b[0m, v" + p.version + ")" + verifiedBadge);
    console.log("  Rating:      ★ " + p.rating + " (" + p.reviewCount + " reviews) | Installs: " + p.installCount);
    console.log("  Description: " + p.description);
    console.log("  Tags:        " + p.tags.join(", "));
    console.log("  Install:     \x1b[32mnpx total-recall plugin install " + p.sourceUrl + "\x1b[0m\n");
  }
}
