## 4. Coordinate a bounded fan-out

Decompose the request into independent, self-contained assignments. Each prompt states goal, repo/cwd, owned files, read-only or edit authority, expected evidence and test location. Read [delegated contract review](../../subagents/review-agent-contract.md) when delegating an audit.

Discover the host's available slots and account limits. Native in-app subagent limits and separately spawned terminal processes are different capacities; neither provides unlimited concurrency. Start with a small bounded batch, probe each selected account once, then increase only while permitted by memory/CPU/quota and file ownership. Keep a process inventory and join every result. Never launch an unbounded council or overlapping autonomous writers.

Use asynchronous subprocesses with `shell:false`, an argv array and a specific cwd. Prompt files/stdin avoid shell interpretation and command-line prompt exposure. Keep stdout and stderr separate, cap output, enforce a timeout with process-tree cleanup, and await completion before the parent exits. Synchronous launch is acceptable only for short metadata probes, not parallel task execution. Remote prompts travel via stdin or a reviewed transport; JSON.stringify is not shell escaping.

Run repository tests/gates on its sanctioned host and in background as required by its instructions. A coding child must obey those same rules. Do not add a provider key or a universal safety bypass to make a failing dispatch appear successful.

