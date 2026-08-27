import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

test('package metadata is set up', () => {
  assert.equal(pkg.name, 'beltorganics');
  assert.equal(pkg.type, 'module');
  assert.ok(pkg.engines.node);
});