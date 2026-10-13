## Share with another user

`total-recall plugin share <id>` marks an installed plugin shareable. Configure `TR_PUBLIC_BASE_URL` as the node's externally reachable HTTPS origin; the command and dashboard then show a direct link ending in `#sha256=<content hash>`. Send that link to the recipient. They install with `total-recall plugin install '<link>'`. The installer requires HTTPS, rejects private destination addresses and redirects, caps the bundle size, and verifies the pinned SHA-256 before writing files. There is no central catalog. The hosting node must actually be reachable at its configured HTTPS origin.

`total-recall plugin unshare <id>` stops serving the bundle. Existing installations remain on recipients' machines. Users on one private mesh may also use `peer:<host>/<id>`; mesh membership is not required for public sharing.
