## Procedure for Changes

1. Classify the change: core primitive, contract behavior, runtime behavior,
   semantic/localization behavior, bundle/provisioning behavior, projection, or
   host extension.
2. Inspect the registry, spec section, implementation, fixtures, and host bridge
   for that surface.
3. Make the smallest coherent change across code and canon.
4. Add positive, negative, replay, and invalid-path cases where applicable.
5. Run focused validation, then the full conformance gate.
6. Update skill/reference mirrors only after the executable contract is green.

