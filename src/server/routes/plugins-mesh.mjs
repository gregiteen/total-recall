/**
 * Peer-facing plugin routes — how one Total Recall node shares plugins with
 * another. Only reachable from the mesh (100.64.0.0/10) or loopback with the
 * shared TR_MESH_SYNC_TOKEN, and only ever read-only: a peer can see and fetch
 * what this node's owner marked shared, nothing more.
 */
import { Router } from "express";
import { requireMeshSyncAuth } from "../../core/mesh-auth.mjs";
import { getMeshHostname } from "../../core/mesh.mjs";
import { listSharedPlugins, packSharedPlugin, packPublicPlugin } from "../../core/plugin-store.mjs";
import { serverError } from "./_shared.mjs";

const router = Router();
const ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

router.get("/api/mesh/plugins", requireMeshSyncAuth, (_req, res) => {
  try {
    const plugins = listSharedPlugins(process.cwd()).map(({ _plugin, ...rest }) => rest);
    res.json({ node: { hostname: getMeshHostname() }, plugins });
  } catch (err) {
    serverError(res, err);
  }
});

router.get("/api/mesh/plugins/:id/bundle", requireMeshSyncAuth, (req, res) => {
  try {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "Invalid plugin id" });
    const bundle = packSharedPlugin(req.params.id, process.cwd());
    if (!bundle) return res.status(404).json({ error: `Plugin ${req.params.id} is not shared by this node` });
    res.json(bundle);
  } catch (err) {
    serverError(res, err);
  }
});

// Shared bundles are public by owner choice. The recipient's URL carries a
// content hash pin; this route never lists plugins or executes their code.
router.get("/api/public/plugins/:id/bundle", (req, res) => {
  try {
    if (!ID_PATTERN.test(req.params.id)) return res.status(400).json({ error: "Invalid plugin id" });
    const bundle = packPublicPlugin(req.params.id, process.cwd());
    if (!bundle) return res.status(404).json({ error: "Plugin is not shared" });
    res.set("Cache-Control", "no-store").json(bundle);
  } catch (err) {
    serverError(res, err);
  }
});

export default router;
