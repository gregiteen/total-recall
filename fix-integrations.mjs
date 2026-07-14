import fs from 'fs';
let content = fs.readFileSync('src/server/routes/integrations.spec.mjs', 'utf8');

// Replace the app setup to ensure body is parsed
content = content.replace(
  'app.use(integrationsRouter);',
  'app.use((req, res, next) => { if (req.headers["x-mock-body"]) req.body = JSON.parse(req.headers["x-mock-body"]); next(); });\napp.use(integrationsRouter);'
);

content = content.replace(
  /\.send\(\{ client: 'cursor' \}\)/g,
  ".set('x-mock-body', JSON.stringify({ client: 'cursor' })).send({ client: 'cursor' })"
);

content = content.replace(
  /\.send\(\{\}\)/g,
  ".set('x-mock-body', JSON.stringify({})).send({})"
);

content = content.replace(
  /\.send\(\{ client: 'unknown-ide' \}\)/g,
  ".set('x-mock-body', JSON.stringify({ client: 'unknown-ide' })).send({ client: 'unknown-ide' })"
);

content = content.replace(
  /\.send\(\{ client: 'vscode', baseUrl: 'http:\/\/localhost:3000' \}\)/g,
  ".set('x-mock-body', JSON.stringify({ client: 'vscode', baseUrl: 'http://localhost:3000' })).send({ client: 'vscode', baseUrl: 'http://localhost:3000' })"
);

fs.writeFileSync('src/server/routes/integrations.spec.mjs', content);
