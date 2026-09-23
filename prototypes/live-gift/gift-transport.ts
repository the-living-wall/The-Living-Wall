import type { GiftView } from '../../services/gifts/common.ts';

export class ApiError extends Error {
  status: number;
  retryable: boolean;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.retryable = status === 429 || status >= 500;
  }
}
export type GiftRequest = {
  path: string;
  method: string;
  body?: unknown;
  token?: string;
};
export type GiftTransport = (request: GiftRequest) => Promise<GiftView>;
export type SdkClient = {
  ensureSession(): Promise<void>;
  invoke(data: { protocol: string; request: GiftRequest }): Promise<unknown>;
};
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function businessResult(status: number, value: unknown): GiftView {
  const data = record(value);
  if (!data) throw new ApiError(502, '连接返回了异常结果，请稍后重试。');
  if (status >= 400) {
    // Platform session failure is recoverable; do not erase a gift's credentials.
    if (status === 401)
      throw new ApiError(503, '连接授权暂不可用，请稍后重试。');
    throw new ApiError(
      status,
      typeof data.error === 'string' && data.error.length <= 200
        ? data.error
        : '暂时无法保存，请稍后重试。',
    );
  }
  if (status !== 200 && status !== 201)
    throw new ApiError(502, '连接返回了异常结果，请稍后重试。');
  if (
    data.deleted !== true &&
    (typeof data.id !== 'string' ||
      !/^[a-f0-9]{32}$/.test(data.id) ||
      (data.actor !== 'sender' && data.actor !== 'friend') ||
      !Number.isSafeInteger(data.revision) ||
      !record(data.state))
  )
    throw new ApiError(502, '连接返回了异常结果，请稍后重试。');
  return data as GiftView;
}

export function platformError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  const data = record(error);
  // Never display a provider's raw body/message: it may contain request details.
  const rawCode = data?.code ?? data?.error;
  const code = typeof rawCode === 'string' ? rawCode.toUpperCase() : '';
  const status = data?.status ?? data?.statusCode;
  if (status === 429 || /LIMIT|TOO_MANY|THROTTL|EXCEED/.test(code))
    return new ApiError(429, '访问有些频繁，请稍后重试；未发送的内容仍保留。');
  if (
    status === 401 ||
    status === 403 ||
    /AUTH|PERMISSION|TOKEN|LOGIN|CREDENTIAL/.test(code)
  )
    return new ApiError(
      503,
      '连接授权暂不可用，请稍后重试；未发送的内容仍保留。',
    );
  return new ApiError(503, '连接暂时中断，请稍后重试；未发送的内容仍保留。');
}

export function httpTransport(fetcher: typeof fetch = fetch): GiftTransport {
  return async ({ path, method, body, token }) => {
    try {
      const response = await fetcher('/api/gifts' + path, {
        method,
        cache: 'no-store',
        signal: AbortSignal.timeout(12000),
        headers: {
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      let value: unknown;
      try {
        value = await response.json();
      } catch {
        throw platformError({ status: response.status });
      }
      return businessResult(response.status, value);
    } catch (e) {
      throw platformError(e);
    }
  };
}

export function sdkTransport(
  load: () => Promise<SdkClient>,
  timeoutMs = 12000,
): GiftTransport {
  // Failed loads/sessions must be retryable. One shared login for parallel reads.
  let clientPromise: Promise<SdkClient> | undefined;
  let sessionPromise: Promise<void> | undefined;
  const getClient = () =>
    (clientPromise ??= load().catch((e) => {
      clientPromise = undefined;
      throw e;
    }));
  return async (request) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let expired = false;
    try {
      const work = async () => {
        const client = await getClient();
        if (expired) throw new ApiError(504, '连接超时，请重试。');
        if (!sessionPromise) {
          const pending = client.ensureSession();
          sessionPromise = pending;
          void pending
            .finally(() => {
              if (sessionPromise === pending) sessionPromise = undefined;
            })
            .catch(() => {});
        }
        await sessionPromise;
        if (expired) throw new ApiError(504, '连接超时，请重试。');
        const response = record(
          await client.invoke({ protocol: 'gifts/1', request }),
        );
        if (!response || response.code) throw platformError(response);
        let result = response.result;
        if (typeof result === 'string') {
          try {
            result = JSON.parse(result);
          } catch {
            throw new ApiError(502, '连接返回了异常结果，请稍后重试。');
          }
        }
        const envelope = record(result);
        if (!envelope || !Number.isInteger(envelope.status))
          throw new ApiError(502, '连接返回了异常结果，请稍后重试。');
        return businessResult(envelope.status as number, envelope.value);
      };
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            sessionPromise = undefined;
            clientPromise = undefined;
            reject(
              new ApiError(
                504,
                '暂未确认保存结果，请重试；原请求和文字仍保留。',
              ),
            );
          }, timeoutMs);
        }),
      ]);
    } catch (e) {
      throw platformError(e);
    } finally {
      clearTimeout(timer);
    }
  };
}
