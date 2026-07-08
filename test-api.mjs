const res = await fetch('http://127.0.0.1:3000/api/openrouter-models', {
  headers: {
    'Authorization': 'Bearer test'
  }
});
console.log(res.status);
console.log(res.headers.get('content-type'));
const text = await res.text();
console.log(text.substring(0, 100));
