# Dynamic Brain Graph Sync — Product Requirement Document (PRD)

## 1. Goal & Context
The goal is to enhance the Total Recall Sovereign AI OS dashboard by optimizing the model selection flow, purging stale warning banners, implementing concurrent multi-brain layer selection in the sidebar, syncing the brain selector directly with the 3D visual graph constellation, and enabling full markdown document rendering within the 3D graph detail panel.

## 2. Requirements & Scope
- **Dashboard Cleanup**: Completely purge the flashing red Emergency Alert Banner from the frontend.
- **Dynamic Model Selection**: Delete the custom submodel input text box and `'custom'` options in the model selector. Automatically initialize chat selector to the first optimal dynamic Gemini model returned from the `/api/gemini-models` service.
- **Concurrent Multi-Brain Selection**: Refactor the brain selector sidebar button to support comma-separated brain layers, toggle checks on click without closing the dropdown, compute and display accumulated unified stats (total node count + concatenated names), and display a multi-layered indicator gradient dot when multiple brains are selected.
- **Constellation Dynamic Sync**: Connecting the sidebar brain selector dynamically to the 3D graph and memory pages so that changing layers reloads the nodes instantly.
- **In-Graph Markdown Viewer**: Replaced the brief summary excerpt in the 3D graph panel with a full visual markdown document viewer that scrolls beautifully for long documents.
