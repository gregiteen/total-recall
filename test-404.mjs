import http from 'http';

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/ssss/instructions?surface=AGENTS.md',
  method: 'GET',
  headers: {
    // We might need to bypass auth, but let's see what we get without auth first
  }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${body}`);
  });
});

req.on('error', console.error);
req.end();
