import fs from 'fs';
let content = fs.readFileSync('frontend/src/pages/ModelsPage.tsx', 'utf8');

const warningGemini = `                  {!configData?.secrets?.gemini_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>`;
content = content.replace(/<\/select>\s*<\/div>/, `</select>\n${warningGemini}`);

const warningClaude = `                  {!configData?.secrets?.anthropic_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>`;
content = content.replace(/<\/select>\s*<\/div>/, `</select>\n${warningClaude}`);

const warningOpenai = `                  {!configData?.secrets?.openai_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>`;
content = content.replace(/<\/select>\s*<\/div>/, `</select>\n${warningOpenai}`);

const warningOpenrouter = `                  {!configData?.secrets?.openrouter_api_key && (
                    <div style={{ fontSize: 11, color: 'var(--text-error, #f44336)', marginTop: 8 }}>
                      ⚠ API Key required to unlock model selection
                    </div>
                  )}
                </div>`;
content = content.replace(/<\/select>\s*<\/div>/, `</select>\n${warningOpenrouter}`);

fs.writeFileSync('frontend/src/pages/ModelsPage.tsx', content);
