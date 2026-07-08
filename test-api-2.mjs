const res = await fetch('http://127.0.0.1:3000/api/openrouter-models', {
  method: 'GET'
});
console.log(res.status);
const text = await res.text();
console.log(text.substring(0, 100));
