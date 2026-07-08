import fetch from 'node-fetch';
const res = await fetch('http://localhost:3000/api/openrouter-models');
console.log(res.status);
const text = await res.text();
console.log(text.substring(0, 100));
