## Credential rotation subsystem

`src/core/rotation-capability.mjs`, `provider-rotation-recipes.mjs`,
`browser-session.mjs`, `secrets-rotate.mjs`.

Every key resolves to exactly one rotation class:

| Class | Meaning |
| --- | --- |
| `self_generated` | TR mints the new value itself. No provider, no human. |
| `provider_api` | Provider exposes a rotation API. |
| `provider_browser` | Requires the console. TR drives or supervises a browser. |
| `manual` | Key material, recovery codes, OAuth secrets — human only, with a stated reason. |
| `non_secret` | Internal bookkeeping. Never rotated. |

