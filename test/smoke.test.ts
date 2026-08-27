import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PROJECT_NAME } from '../src/index';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

describe('package metadata', () => {
  it('is set up for a TypeScript web app', () => {
    expect(pkg.name).toBe('beltorganics');
    expect(pkg.type).toBe('module');
    expect(pkg.engines.node).toBeTruthy();
    expect(pkg.scripts.build).toContain('vite build');
    expect(pkg.scripts.test).toContain('vitest');
  });
});

describe('library entry', () => {
  it('exposes the project name', () => {
    expect(PROJECT_NAME).toBe('BeltOrganics');
  });
});
