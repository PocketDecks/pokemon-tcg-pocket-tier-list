import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('analysis/src/ import layering', () => {
  const srcDir = join(__dirname, '..');
  const tsFiles = readdirSync(srcDir, { recursive: true })
    .filter(
      (p): p is string =>
        typeof p === 'string' && p.endsWith('.ts') && !p.includes('__tests__')
    )
    .map((p) => join(srcDir, p));

  it('never imports from analysis/scripts/', () => {
    for (const file of tsFiles) {
      const source = readFileSync(file, 'utf8');
      // Any import specifier that contains 'scripts/' would reach the scripts layer.
      const importSpecifiers = source.match(/from\s+['"][^'"]*scripts\//g);
      expect(importSpecifiers).toBeNull();
    }
  });
});
