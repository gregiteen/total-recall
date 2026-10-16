## Authority Order

When sources disagree, resolve drift in this order:

1. Conformance fixtures and tests for observed executable behavior.
2. `registry/core.json` for required fields, enums, append behavior, and
   portability.
3. `docs/ssss-spec.md` for normative semantics.
4. Reference engine/runtime/bundle code.
5. Host extension registry and host adapter documentation.
6. Skills, examples, README prose, and copied mirrors.

Do not silently pick one side. Identify the mismatch, decide whether code or
canon is wrong, update every affected source, and add a regression check.

