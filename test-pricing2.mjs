async function getPricingMap() {
  const response = await fetch('https://openrouter.ai/api/v1/models');
  const data = await response.json();
  const map = {};
  for (const m of data.data) {
    if (m.id.includes('claude-3-opus')) {
      console.log(m.id, m.pricing);
    }
  }
}
getPricingMap();
