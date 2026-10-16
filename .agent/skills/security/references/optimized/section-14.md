## Audit commands

```bash
npm audit --omit=dev
```

```bash
git grep -nIE "(sk-or-v1-[a-f0-9]{20}|sk_live_[A-Za-z0-9]{20}|ghp_[A-Za-z0-9]{30}|sbp_[a-f0-9]{30}|dop_v1_[a-f0-9]{30}|AIza[A-Za-z0-9_-]{30}|npm_[A-Za-z0-9]{30})"
```

```bash
git ls-files | grep -iE "^\.env$|\.env\.|secrets\.enc|\.pem$|id_rsa|id_ed25519"
```

```bash
npx total-recall secret rotation-status
```

Check for pathless auth mounts before shipping a route:

```bash
grep -rn "router.use(requireAuth)" src/server/routes/
```

---

