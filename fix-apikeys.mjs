import fs from 'fs';

let content = fs.readFileSync('frontend/src/pages/ApiKeysPage.tsx', 'utf8');

// The file ends with undefinedundefined
content = content.replace(/undefinedundefined/g, '');

// The current ending is:
/*
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                These keys are stored locally and injected into the CLI reasoning agents on dispatch.
              </span>
        </div>
      )}
*/
// Wait, the original end of ApiKeysPage was:
/*
      {tab === 'pats' && (
        ...
      )}
    </div>
  );
}
*/
// The split destroyed the end of the file because it didn't match!
// Let me look at git diff to see what was lost.
