async function getPricingMap() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const response = await fetch('https://openrouter.ai/api/v1/models', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      const map = {};
      for (const m of (data.data || [])) {
        const parts = m.id.split('/');
        const baseId = parts[parts.length - 1];
        map[baseId] = m.pricing;
        map[m.id] = m.pricing;
      }
      return map;
    }
  } catch (e) {
    console.error("ERROR:", e);
  }
  return {};
}

getPricingMap().then(map => {
  console.log("Keys:", Object.keys(map).length);
  console.log("Claude Opus:", map['claude-3-opus']);
});
