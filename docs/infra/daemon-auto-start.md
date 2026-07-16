# Total Recall Daemon Auto-Start

Because the Total Recall Daemon now uses a leader election and secrets synchronization mechanism across the mesh, we no longer recommend using macOS `launchd` for the initial daemon processes.

Instead, start the daemon using `pm2`, `tmux`, or a manual background process so that you have direct access to its standard output and can verify election states before detaching.

## Recommended: Using pm2

If you want the daemon to restart on crashes:
```bash
npm install -g pm2
pm2 start src/core/daemon-loop.mjs --name "total-recall-daemon"
pm2 save
pm2 startup
```

## Manual Start
```bash
cd ~/Github/total-recall
node src/core/daemon-loop.mjs
```

## Removing legacy launchd agents
If your system still has the old `launchd` `.plist` files:
```bash
launchctl unload ~/Library/LaunchAgents/com.totalrecall.daemon.plist
launchctl unload ~/Library/LaunchAgents/com.totalrecall.server.plist
rm ~/Library/LaunchAgents/com.totalrecall.daemon.plist
rm ~/Library/LaunchAgents/com.totalrecall.server.plist
```
