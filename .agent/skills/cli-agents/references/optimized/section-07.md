## 6. Total Recall registry boundary

The legacy runtime registry can resolve, in order, the active brain's `modules/agents/agents.yml`, nested `skills/cli-agents/agents.yml`, then `.agent/skills/cli-agents/agents.yml`. Confirm the actual first existing path and enabled profiles before editing configuration. `callLocalRuntime(prompt, system, config)` requires all three arguments.

The skill's [agents.yml](../../agents.yml) is a compatible conservative profile reference, not proof every catalog CLI is integrated. Current host implementations may have independent flag builders, credential injection or parsing; inspect them before using `harness dispatch`, `agent spawn` or a council. When a host cannot preserve subscription auth/permissions/output semantics, use the verified direct helper and record the host defect rather than falsely certifying it. Additional agents require a real argv/auth/parser adapter and tests before registry support is claimed.

