# Code Mode Sandbox API

The Total Recall Code Mode Sandbox runs completely in the browser via a Virtual File System (VFS) and WebContainers.

## Key Primitives
- `search_api`: Searches the MCP/Skill database for schemas.
- `execute_api`: Executes the actual HTTP/API call without MCP middleware.
- `create_file`: Writes to the VFS.
- `read_file`: Reads from the VFS.

## Isolation
- Code Mode assistants DO NOT have access to the local `.agent/skills` directory.
- All code runs inside the secure WebContainer.
