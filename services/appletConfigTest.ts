import { MyBuysService } from './MyBuysService';
import { SigmaRestApiService } from './SigmaRestApiService';
import type { TestResult } from '../components/TestResultBanner';

export type AppletConfigTestInput = {
  embedUrl: string;
  embedClientId: string;
  embedSecretKey: string;
  useRestApiFeatures: boolean;
  hasRestCreds: boolean;
  sameAsEmbed: boolean;
  resolvedRestClientId: string;
  resolvedRestSecret: string;
  sigmaApiBaseUrl: string;
};

export async function runAppletConfigTest(input: AppletConfigTestInput): Promise<TestResult> {
  const {
    embedUrl,
    embedClientId,
    embedSecretKey,
    useRestApiFeatures,
    hasRestCreds,
    sameAsEmbed,
    resolvedRestClientId,
    resolvedRestSecret,
    sigmaApiBaseUrl,
  } = input;

  const result = await MyBuysService.testConfiguration({ embedUrl, embedClientId, embedSecretKey });
  if (!result.success) {
    return { success: false, message: `Embed key failed: ${result.message}` };
  }

  if (useRestApiFeatures && hasRestCreds) {
    const whoami = await SigmaRestApiService.whoami(
      resolvedRestClientId,
      resolvedRestSecret,
      sigmaApiBaseUrl,
    );
    if (!whoami.success) {
      const message = sameAsEmbed
        ? `Good news — your embed key works. The bad news is that same key doesn't have REST API access (${whoami.message}). In Sigma, an API key's Embed and REST API permissions are set at creation and can't be changed later. Either use a separate REST API key, or regenerate a new key with both Embed and REST API checked.`
        : `Embed key works, but the REST API key failed: ${whoami.message}`;
      return { success: false, message };
    }
    return { success: true, message: `Embed OK (HTTP ${result.statusCode}). REST API verified.` };
  }

  return { success: true, message: `Test successful! (HTTP ${result.statusCode})` };
}
