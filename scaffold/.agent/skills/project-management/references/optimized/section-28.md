### Feature flags

New major features or sweeping architectural changes should be hidden behind a feature flag until verified stable, so trunk-based merges don't destabilize the live product. Strip the flag and dead fallback code once the feature is stable — that cleanup is itself trackable work, not something to leave indefinitely.

