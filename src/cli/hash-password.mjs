import bcrypt from 'bcrypt';

export default async function hashPassword(args) {
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
  total-recall hash-password "new dashboard password"

  Prints a bcrypt hash for ~/.agent/config/security.yml dashboard.password_hash.
`);
    return;
  }

  const password = args.join(' ');
  if (password.length < 12) {
    console.error('Password must be at least 12 characters.');
    process.exit(1);
  }

  console.log(await bcrypt.hash(password, 12));
}
