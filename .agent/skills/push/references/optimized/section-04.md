### Host prerequisites (Linux)

The vector index uses the `sqlite-vss` extension, which links BLAS/LAPACK. Without
them the brain still runs, but it logs `sqlite-vss unavailable; using JSON-only
store` and silently falls back to a slower path:

```bash
apt-get install -y libblas3 liblapack3        # Ubuntu/Debian
ldd node_modules/sqlite-vss-linux-x64/lib/vss0.so | grep 'not found'   # must be empty
```

A host also needs `TR_SECRETS_PASSWORD` in its environment to decrypt its own
secrets store — without it the embedding provider key is unreachable, no vectors
are built, and recall degrades to keyword-only while still reporting itself up.
`auto-pull.sh` sources `/root/.agent/tr.env` (0600, host-local) when present.


