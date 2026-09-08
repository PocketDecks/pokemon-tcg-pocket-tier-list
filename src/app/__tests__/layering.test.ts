import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

describe('frontend layering', () => {
  const rootDir = join(__dirname, '../../../');
  const pagesDir = join(rootDir, 'src/pages');
  const appDir = join(rootDir, 'src/app');

  const pageFiles = readdirSync(pagesDir, { withFileTypes: true })
    .flatMap((dirent) =>
      dirent.isDirectory()
        ? readdirSync(join(pagesDir, dirent.name), { withFileTypes: true }).map(
            (d) => join(pagesDir, dirent.name, d.name)
          )
        : [join(pagesDir, dirent.name)]
    )
    .filter((p) => p.endsWith('.ts') || p.endsWith('.tsx'));

  const appTsFiles = readdirSync(appDir, { withFileTypes: true })
    .flatMap((dirent) =>
      dirent.isDirectory()
        ? readdirSync(join(appDir, dirent.name), { withFileTypes: true }).map(
            (d) => join(appDir, dirent.name, d.name)
          )
        : [join(appDir, dirent.name)]
    )
    .filter(
      (p) =>
        p.endsWith('.ts') &&
        !p.includes('__tests__') &&
        !/\/use-/.test(p) &&
        !/\\use-/.test(p)
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
