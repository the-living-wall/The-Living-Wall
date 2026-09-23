import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { GiftStore } from './store.ts';
import { giftServer } from './server.ts';

const port = Number(process.env.PORT || 4190);
const origin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
if (new URL(origin).origin !== origin)
  throw new Error(
    'PUBLIC_ORIGIN must be an origin without path or trailing slash.',
  );
const data = resolve(process.env.GIFT_DB || 'outputs/gifts/data.sqlite');
const staticDir = resolve(process.env.GIFT_STATIC || 'outputs/gifts/site');
if (data.startsWith(staticDir + '/'))
  throw new Error('Database must be outside the static directory.');
process.umask(0o077);
mkdirSync(dirname(data), { recursive: true, mode: 0o700 });
const store = new GiftStore(data);
chmodSync(data, 0o600);
const server = giftServer(store, { origin, staticDir });
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`Friends test service: ${origin}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
