import ms from 'ms';

import {
  ENV_NETWORK_RESOLVE_TIMEOUT,
  ENV_NETWORK_TIMEOUT_KEY,
  ENV_SURGIO_NETWORK_CLASH_UA,
  ENV_SURGIO_NETWORK_CONCURRENCY,
  ENV_SURGIO_NETWORK_RETRY,
  ENV_SURGIO_PROVIDER_CACHE_MAXAGE,
  ENV_SURGIO_REMOTE_SNIPPET_CACHE_MAXAGE,
} from '../constant';

export const getNetworkTimeout = (): number =>
  process.env[ENV_NETWORK_TIMEOUT_KEY]
    ? Number(process.env[ENV_NETWORK_TIMEOUT_KEY])
    : ms('5s');

export const getNetworkResolveTimeout = (): number =>
  process.env[ENV_NETWORK_RESOLVE_TIMEOUT]
    ? Number(process.env[ENV_NETWORK_RESOLVE_TIMEOUT])
    : ms('10s');

export const getNetworkConcurrency = (): number =>
  process.env[ENV_SURGIO_NETWORK_CONCURRENCY]
    ? Number(process.env[ENV_SURGIO_NETWORK_CONCURRENCY])
    : 5;

export const getNetworkRetry = (): number =>
  process.env[ENV_SURGIO_NETWORK_RETRY]
    ? Number(process.env[ENV_SURGIO_NETWORK_RETRY])
    : 0;

export const getNetworkClashUA = (): string =>
  process.env[ENV_SURGIO_NETWORK_CLASH_UA] ?? 'clash';

export const getRemoteSnippetCacheMaxage = (): number =>
  process.env[ENV_SURGIO_REMOTE_SNIPPET_CACHE_MAXAGE]
    ? Number(process.env[ENV_SURGIO_REMOTE_SNIPPET_CACHE_MAXAGE])
    : ms('12h');

export const getProviderCacheMaxage = (): number =>
  process.env[ENV_SURGIO_PROVIDER_CACHE_MAXAGE]
    ? Number(process.env[ENV_SURGIO_PROVIDER_CACHE_MAXAGE])
    : ms('10m');
