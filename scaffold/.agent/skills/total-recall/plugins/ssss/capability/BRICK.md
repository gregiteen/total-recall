# SSSS capability

Install the pinned canonical engine dependency from the plugin package manifest. Import the functions from **capability/index.mjs**. The capability takes explicit inputs and returns structured data.

| Function | Input and result |
| --- | --- |
| canonicalToolchain() | Resolve the pinned engine, registry version and executable from the installed package. |
| scaffoldProject(options) | An absolute or caller-relative directory, optional project name and extension. Generates a complete standalone project and returns its file inventory. Use git:false to omit repository initialization. |
| validateDocument(options) | Markdown content and optional parsed extension registry objects. Returns validity, qualified type, errors and warnings. |
| verifyRegistry(options) | Parsed lock and optional extension registry objects. Returns the canonical integrity verdict and spec version. |
| runConformance() | Run the reference engine suite and return process status and evidence. |

Use the returned validity and success fields to decide whether to proceed. The capability uses the local canonical package and needs no credentials. Repository authors own generated projects.
