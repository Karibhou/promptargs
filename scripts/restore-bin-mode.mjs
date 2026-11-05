import { chmodSync, readFileSync, statSync } from 'node:fs';

const { bin } = JSON.parse(readFileSync('package.json', 'utf8'));
for (const file of typeof bin === 'string' ? [bin] : Object.values(bin)) {
  chmodSync(file, statSync(file).mode | 0o111);
}
