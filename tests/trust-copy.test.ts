import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trustCopy } from '../lib/trust-copy.ts';

void test('trust copy respects boundaries without exposing a score', () => {
  assert.equal(trustCopy(0.199, 'observe'), '小心试探');
  assert.equal(trustCopy(0.2, 'observe'), '还在观察');
  assert.equal(trustCopy(0.45, 'approach'), '还在观察');
  assert.equal(trustCopy(0.451, 'approach'), '愿意靠近');
  assert.equal(trustCopy(0.7, 'bond'), '安心相伴');
});

void test('immediate boundaries take precedence over high trust', () => {
  assert.equal(trustCopy(1, 'startle', true), '先给它一点空间');
  assert.equal(trustCopy(1, 'recover'), '慢慢找回安心');
  assert.equal(trustCopy(1, 'bond', true), '陪它歇一会儿');
  assert.equal(trustCopy(1, 'alone'), '等一次温柔的相遇');
  assert.equal(trustCopy(1, 'search'), '还望着你离开的方向');
});
