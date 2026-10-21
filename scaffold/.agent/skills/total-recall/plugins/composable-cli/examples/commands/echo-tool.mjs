// Auto-generated custom CLI command: echo-tool
// @description Generic example command demonstrating the composable CLI contract.
// @risk read
export async function run(argv = []) {
  const args = Array.isArray(argv) ? argv.slice(3) : [];
  const json = args.includes('--json');
  const payload = {
    ok: true,
    timestamp: new Date().toISOString(),
    args: args.filter((a) => a !== '--json'),
  };

  if (json) {
    console.log(JSON.stringify(payload));
  } else {
    console.log('Echo tool executed successfully.');
    console.log(`Received args: ${payload.args.join(' ')}`);
  }
}

export default async function (args = []) {
  console.log(`Echo tool received: ${args.join(' ')}`);
}
