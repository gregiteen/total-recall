### Step 4: Publish to git remote & NPM
Execute the automated local publish script to securely handle the NPM token swap, push release commits and tags to your git remote repository, and publish to the public npm registry locally with zero user-friction:
```bash
node .agent/skills/push/scripts/publish.mjs
```
This script automatically:
1. Loads `npm_token` from the encrypted secrets store — the workspace `.agent`, then the global brain — which needs the master password (see the security skill for how it is resolved).
2. Backs up your active `~/.npmrc` profile.
3. Automatically configures and authenticates your active terminal session with the loaded token.
4. Executes `git push origin main --tags` to push version tags/commits to the remote repository.
5. Executes `npm publish` to publish the package directly and locally to the npm registry.
6. Automatically executes `total-recall update --apply --force` to upgrade all registered project brains immediately to the newly published version.
7. Automatically restores your original `~/.npmrc` profile upon completion.

> [!NOTE]
> All GitHub Actions workflows for NPM publication have been completely removed from the repository. Publishing is executed strictly, securely, and locally from your terminal using the publish script.

---

