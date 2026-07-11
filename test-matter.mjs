import matter from 'gray-matter';
const node = {
  type: 'memory',
  slug: 'test-node',
  category: 'facts',
  title: 'Test',
  body: 'Body',
};
const raw = matter.stringify(node.body, node);
console.log('RAW:\n' + raw);
const parsed = matter(raw);
console.log('PARSED TYPE: ' + parsed.data.type);
