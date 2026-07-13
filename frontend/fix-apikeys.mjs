import fs from 'fs';

let content = fs.readFileSync('src/pages/ApiKeysPage.tsx', 'utf8');

// 1. Remove the trailing cloud tab block from the bottom
let cloudTabStart = content.indexOf("      {tab === 'cloud' && (");
if (cloudTabStart !== -1) {
  content = content.substring(0, cloudTabStart).trim() + '\n';
}

// 2. Insert the cloud tab block BEFORE the end of ApiKeysPage component
let cloudTabCode = fs.readFileSync('cloud_tab.tsx', 'utf8');

let insertionPointStr = `
      <p style={{ marginTop: 24, fontSize: 11, color: 'var(--text-tertiary)' }}>
        CLI: <code>secret catalog</code> · <code>secret meta KEY --repo app --tier pro --monthly-cost 25 --rotate-days 90</code> ·{' '}
        <code>secret rotation-due</code> · <code>secret usage</code> · <code>secret providers</code>
      </p>
    </div>
  )
}
`;

content = content.replace(insertionPointStr, cloudTabCode + '\n\n' + insertionPointStr);

fs.writeFileSync('src/pages/ApiKeysPage.tsx', content);
console.log('Fixed file');
