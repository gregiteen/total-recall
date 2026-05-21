import https from 'node:https';

const key = "590518870d8a349924f9e1449081aa3295788790e9fbbea907fc3e9c7ae9468f";

const queryObj = {
  gpu_name: {
    in: [
      "RTX 3090", "RTX 4090", "A5000", "RTX A5000", "A6000", "RTX A6000",
      "RTX 6000 Ada", "A100", "L40", "L40S"
    ]
  },
  disk_space: { gte: 40 },
  reliability2: { gte: 0.9 },
  rentable: { eq: true },
  order: [["dph_total", "asc"]],
  limit: 5
};

const path = `/api/v0/bundles/?q=${encodeURIComponent(JSON.stringify(queryObj))}`;
const url = new URL(path, 'https://console.vast.ai');

const options = {
  method: 'GET',
  headers: {
    'Accept': 'application/json',
    'Authorization': `Bearer ${key}`
  }
};

const req = https.request(url, options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      if (!parsed.offers || parsed.offers.length === 0) {
        console.log('No matching offers found!');
        return;
      }
      console.log('--- BEST 24GB+ GPU DEALS ON VAST.AI ---');
      parsed.offers.slice(0, 5).forEach((offer, idx) => {
        const costPerMonth = (offer.dph_total * 24 * 30).toFixed(2);
        console.log(`${idx + 1}. Offer ID: ${offer.id}`);
        console.log(`   GPU: ${offer.gpu_name} (${Math.round(offer.gpu_ram/1024)} GB VRAM)`);
        console.log(`   Price: $${offer.dph_total.toFixed(4)}/hr (~$${costPerMonth}/mo)`);
        console.log(`   Location: ${offer.location?.country || 'unknown'}`);
        console.log(`   Specs: ${offer.cpu_name} | ${offer.num_gpus}x GPU | ${offer.disk_space} GB Disk`);
        console.log(`   Reliability: ${(offer.reliability2 * 100).toFixed(1)}%`);
        console.log('---------------------------------------');
      });
    } catch (err) {
      console.error('Failed to parse response:', err.message, data);
    }
  });
});

req.on('error', (err) => console.error('Request failed:', err.message));
req.end();
