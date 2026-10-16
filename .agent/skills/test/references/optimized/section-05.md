### Test Organization

```
src/
├── cli/
│   ├── remember.mjs          # CLI command
│   └── remember.spec.mjs     # Unit tests for remember
├── core/
│   ├── surface.mjs           # Surface compiler
│   └── surface.spec.mjs      # Unit tests for surface
└── server/
    └── routes/
        ├── memory.mjs        # Route handler
        └── memory.spec.mjs   # Route tests

frontend/src/
├── pages/
│   ├── ChatPage.tsx          # Page component
│   └── ChatPage.spec.tsx     # Component tests
└── components/
    ├── BrainSelector.tsx
    └── BrainSelector.spec.tsx
```

