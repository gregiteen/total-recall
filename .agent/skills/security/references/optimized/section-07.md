### Provider attribution is a security control

`providerForKeyName()` decides *which console a rotation prompt points at*.

> **Real bug:** the pattern `TR_TOKEN` reduced to the 2-char stem `TR`, which
> matched as a bare substring inside `S-TR-IPE_SECRET_KEY`. A live payments key
> was attributed to `total-recall`. Fixed with token-boundary matching and
> `MIN_FUZZY_STEM = 4`. **A mis-attributed key sends the operator to the wrong
> console to rotate a credential that is still live.** Regression test exists —
> do not delete it.

