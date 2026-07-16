import fs from 'fs';
import { vi } from 'vitest';
vi.mock('fs');
console.log(fs.existsSync);
