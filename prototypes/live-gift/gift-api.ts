import { ApiError, httpTransport, sdkTransport } from './gift-transport.ts';
export { ApiError } from './gift-transport.ts';

const transport =
  import.meta.env.VITE_GIFTS_TRANSPORT === 'cloudbase'
    ? sdkTransport(async () => {
        const env = import.meta.env.VITE_GIFTS_CLOUDBASE_ENV;
        const region = import.meta.env.VITE_GIFTS_CLOUDBASE_REGION;
        const name = import.meta.env.VITE_GIFTS_CLOUDBASE_FUNCTION;
        if (!env || !region || !name)
          throw new ApiError(503, '连接配置尚未完成，请稍后重试。');
        const { createCloudbaseClient } = await import('./cloudbase-client.ts');
        return createCloudbaseClient(env, region, name);
      })
    : httpTransport();
export function api(
  path: string,
  method = 'GET',
  body?: unknown,
  token?: string,
) {
  return transport({ path, method, body, token });
}
