import readline from 'readline';
import { callFrontier, loadFrontierConfig } from '../core/frontier.mjs';
import path from 'path';
import os from 'os';

/**
 * Total Recall CLI Chat Interface
 * Allows direct conversation with the Sovereign OS kernel from the terminal.
 */
export default async function runChat(args) {
  console.log('🤖 Total Recall CLI Chat initialized. Type "exit" to quit.\n');

  const configPath = path.join(os.homedir(), '.agent', 'config', 'frontier.yml');
  let config;
  try {
    config = loadFrontierConfig(configPath);
    console.log(`[Config] Connected to ${config.model} endpoint.\n`);
  } catch (e) {
    console.error(`[!] Failed to load frontier config: ${e.message}`);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: '
  });

  const systemMessage = 'You are the Total Recall Sovereign OS kernel. Keep responses concise and direct.';
  const messages = [];

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log('Goodbye.');
      process.exit(0);
    }

    if (!input) {
      rl.prompt();
      return;
    }

    // Build the prompt with history
    const contextStr = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    const fullPrompt = contextStr ? `${contextStr}\nuser: ${input}\nassistant: ` : input;

    messages.push({ role: 'user', content: input });
    
    try {
      const response = await callFrontier(fullPrompt, systemMessage, config);
      console.log(`\nBrain: ${response}\n`);
      messages.push({ role: 'assistant', content: response });
    } catch (err) {
      console.error(`\n[!] Error: ${err.message}\n`);
      messages.pop(); // Remove user message if failed
    }

    rl.prompt();
  }).on('close', () => {
    console.log('Goodbye.');
    process.exit(0);
  });
}
