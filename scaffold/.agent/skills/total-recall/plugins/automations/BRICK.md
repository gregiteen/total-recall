# Automation source collection

Copy `capability/` into your application. Import `collectSources` from `./capability/index.mjs` and supply unique source IDs, an adapter map, an ISO check timestamp and an optional positive record limit.

Each adapter returns records or `{records,status,error?}`. Status is `ok`, `partial`, `unsupported`, `disabled`, `error` or `unauthorized`. The collector returns `automations`, independent source `coverage`, and `checked_at`; one failed source does not erase successful evidence. Missing adapters stay unsupported and oversized inventories become partial.

Your application owns authorization, data shape, adapter timeouts, execution and persistence. Supply transports and credentials directly to your own adapters. This capability performs no filesystem, network, process or environment access and prints nothing.
