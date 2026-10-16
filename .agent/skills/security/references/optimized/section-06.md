### Invariants — do not relax these

1. **Only `verified: true` recipes may auto-click.** An unverified recipe
   opens the console and instructs the human. Blind-clicking guessed selectors
   on a live payments dashboard is how you refund a stranger or delete a
   production key. Enforced by a spec — keep it that way.
2. **Order is: capture → shape-check → API-verify → store+export → only then
   revoke the old key.** Revoking before the new value is proven working is a
   self-inflicted outage.
3. **Shape-check before storing.** A captured "Copy to clipboard" string that
   overwrites a working credential is worse than a failed rotation.
4. **High-risk providers are flagged** (`high_risk: true`, e.g. Stripe) and
   roll with an expiry window rather than instant invalidation.

