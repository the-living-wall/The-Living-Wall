import cloudbase from '@cloudbase/js-sdk/app';
import { registerAuth } from '@cloudbase/js-sdk/auth';
import { registerFunctions } from '@cloudbase/js-sdk/functions';
registerAuth(cloudbase);
registerFunctions(cloudbase);
import { platformError, type SdkClient } from './gift-transport.ts';

export function createCloudbaseClient(
  env: string,
  region: string,
  name: string,
): SdkClient {
  const app = cloudbase.init({
    env,
    region,
    endPointMode: 'GATEWAY',
    timeout: 12000,
    auth: { detectSessionInUrl: false },
  });
  const auth = app.auth({ persistence: 'local' });
  return {
    async ensureSession() {
      if (await auth.getLoginState()) return;
      const result = await auth.signInAnonymously();
      if (result.error) throw platformError(result.error);
      if (!(await auth.getLoginState()))
        throw platformError({ code: 'AUTH_REQUIRED' });
    },
    invoke: (data) => {
      if (!app.callFunction)
        throw platformError({ code: 'FUNCTIONS_NOT_READY' });
      return app.callFunction({ name, data });
    },
  };
}
