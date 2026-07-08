import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

const oldCode = `                    {orModels.map(m => {
                      let costStr = '';
                      if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                        const promptCost = (parseFloat(m.pricing.prompt) * 1000000).toFixed(2);
                        const compCost = (parseFloat(m.pricing.completion) * 1000000).toFixed(2);
                        costStr = \` - $\${promptCost}/$\${compCost} per 1M\`;
                      }
                      return (
                        <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                      );
                    })}`;

const newCode = `                    {(() => {
                      const groups = {};
                      orModels.forEach(m => {
                        const provider = m.id.split('/')[0].toUpperCase();
                        if (!groups[provider]) groups[provider] = [];
                        groups[provider].push(m);
                      });
                      return Object.keys(groups).map(provider => (
                        <optgroup key={provider} label={provider}>
                          {groups[provider].map(m => {
                            let costStr = '';
                            if (m.pricing && m.pricing.prompt && m.pricing.completion) {
                              const promptCost = (parseFloat(m.pricing.prompt) * 1000000).toFixed(2);
                              const compCost = (parseFloat(m.pricing.completion) * 1000000).toFixed(2);
                              costStr = \` - $\${promptCost}/$\${compCost} per 1M\`;
                            }
                            return (
                              <option key={m.id} value={m.id}>{m.displayName} ({m.id}){costStr}</option>
                            );
                          })}
                        </optgroup>
                      ));
                    })()}`;

content = content.replace(oldCode, newCode);
fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
