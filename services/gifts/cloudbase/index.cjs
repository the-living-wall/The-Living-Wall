/* oxlint-disable typescript/no-require-imports -- CloudBase ordinary functions load a CommonJS index.main entry. */
const cloudbase = require('@cloudbase/node-sdk');
const {
  CloudGiftStore,
  createHandler,
  createSdkHandler,
} = require('./service.cjs');

let store, handler;
function getStore() {
  if (!process.env.GIFT_ENV_ID) throw new Error('GIFT_ENV_ID is required');
  if (!store)
    store = new CloudGiftStore(
      cloudbase.init({ env: process.env.GIFT_ENV_ID }).database(),
    );
  return store;
}
exports.main = async (event) => {
  if (!handler) handler = createHandler(getStore(), process.env.PUBLIC_ORIGIN);
  return handler(event);
};
// Deploy as a separate timer-only function (index.cleanup), with no HTTP route.
exports.cleanup = async (event) => {
  if (event.Type !== 'Timer') throw new Error('Timer trigger required');
  return { removed: await getStore().purge() };
};
// Separate ordinary function (index.sdk), no HTTP route. Not enabled by deploying
// the existing main/cleanup bundle. Platform policy must restrict this function.
const handleSdk = async (event, context) => {
  if (process.env.GIFT_SDK_ENABLED !== 'true')
    return { status: 503, value: { error: '连接配置尚未完成，请稍后重试。' } };
  let uid;
  try {
    const parsed = cloudbase.parseContext(context);
    uid = (parsed.environment || parsed.environ || {}).TCB_UUID;
  } catch {
    /* Missing/malformed platform context fails closed. */
  }
  return createSdkHandler(getStore())(event, uid);
};
// Application diagnostics remain available when platform response-body logging
// is disabled. Never log the event, context, result, message or credentials.
exports.sdk = async (event, context) => {
  const started = Date.now();
  let status = 500;
  try {
    const result = await handleSdk(event, context);
    status = result.status;
    return result;
  } catch {
    return { status: 500, value: { error: '服务暂时不可用，请稍后重试。' } };
  } finally {
    console.info(
      JSON.stringify({
        event: 'gift-sdk-result',
        status,
        durationMs: Math.max(0, Date.now() - started),
      }),
    );
  }
};
