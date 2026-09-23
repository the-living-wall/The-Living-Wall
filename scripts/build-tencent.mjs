import { execFileSync } from 'node:child_process';
import { loadEnv } from 'vite';

// Both bundles must use the same configuration. No fallback to the HTTP demo.
const configured = {
  ...loadEnv('production', process.cwd(), 'VITE_'),
  ...process.env,
};
const enabled = configured.VITE_GIFTS_ONLINE === 'true';
if (enabled) {
  if (configured.VITE_GIFTS_TRANSPORT !== 'cloudbase')
    throw new Error(
      'Production friends requires VITE_GIFTS_TRANSPORT=cloudbase',
    );
  for (const key of [
    'VITE_GIFTS_CLOUDBASE_ENV',
    'VITE_GIFTS_CLOUDBASE_REGION',
    'VITE_GIFTS_CLOUDBASE_FUNCTION',
  ]) {
    if (!configured[key])
      throw new Error(`${key} is required for production friends`);
  }
}
const env = { ...configured, DEPLOY_TARGET: 'tencent' };
execFileSync(process.execPath, ['node_modules/vinext/dist/cli.js', 'build'], {
  env,
  stdio: 'inherit',
});
if (enabled) {
  execFileSync(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      'build',
      '--config',
      'prototypes/live-gift/vite.config.mts',
      '--outDir',
      '../../dist/client/friends',
    ],
    { env: { ...env, PREVIEW_BASE: '/friends/' }, stdio: 'inherit' },
  );
}
