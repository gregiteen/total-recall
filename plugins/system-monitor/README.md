# System Monitor

Adds a host-resources block (load average, free memory) to the compiled agent context, and records one JSON telemetry sample every 15 minutes. Samples are kept in the brain's `plugin.task_run` event log.

**Use cases:** operations, self-hosting

## Install

```bash
npx total-recall plugin install system-monitor
```

## Use

```bash
npx total-recall system-monitor status   # human summary
npx total-recall system-monitor sample   # one JSON sample
```

## Share with your other nodes

```bash
npx total-recall plugin share system-monitor
# on another node on the mesh:
npx total-recall plugin install peer:<this-node>/system-monitor
```
