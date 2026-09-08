import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const collectTs = (dir: string): string[] => {
  return readdirSync(dir, { withFileTypes: true }).flatMap((dirent) => {
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) return collectTs(full);
    return full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
  });
};

describe('frontend layering', () => {
  const rootDir = join(__dirname, '../../../');
  const pagesDir = join(rootDir, 'src/pages');
  const appDir = join(rootDir, 'src/app');

  const pageFiles = collectTs(pagesDir);
  const appTsFiles = collectTs(appDir).filter(
    (p) =>
      !p.includes('__tests__') &&
      !p.replace(/\\/g, '/').includes('/use-')
  );

  it('no file under src/pages/ imports from src/contexts/', () => {
    for (const file of pageFiles) {
      const source = readFileSync(file, 'utf8');
      const importMatches = source.match(
        /from\s+['"`]\.\.?\/(?:src\/)?contexts\//g
      );
      expect(importMatches).toBeNull();
    }
  });

  it('no file under src/app/ imports react (pure helpers carry no React dependency)', () => {
    for (const file of appTsFiles) {
      const source = readFileSync(file, 'utf8');
      const reactImports = source.match(/from\s+['"]react['"]/g);
      expect(reactImports).toBeNull();
    }
  });
});
