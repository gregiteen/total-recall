### Step 3: Package Version Bumping
Determine the release scope and run the version command:
```bash
# Bug fixes only (e.g. 3.0.0 -> 3.0.1)
npm version patch

# Backward-compatible feature addition (e.g. 3.0.0 -> 3.1.0)
npm version minor

# Breaking changes (e.g. 3.0.0 -> 4.0.0)
npm version major
```

