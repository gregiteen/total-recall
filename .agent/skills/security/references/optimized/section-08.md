### Browser profile handling

- Created `0700`, README `0600`. Verify on any change to `browser-session.mjs`.
- Never commit it, never sync it, never include it in a bundle or export.
- `secret browser-logout` / `clearProfile()` must actually remove it.
- Persistent-profile mode is a deliberate choice: it keeps provider sessions
  out of the transcript and out of env vars. That tradeoff only holds while the
  directory permissions hold.

---

