import { createLogger } from '@surgio/logger';
import assert from 'assert';
import fs from 'fs-extra';
import _ from 'lodash';
import os from 'os';
import { join } from 'path';
import queryString from 'query-string';
import { JsonObject } from 'type-fest';
import { URL, URLSearchParams } from 'url';
import URLSafeBase64 from 'urlsafe-base64';
import YAML from 'yaml';
import net from 'net';

import {
  NodeFilterType,
  NodeNameFilterType,
  NodeTypeEnum,
  PlainObjectOf,
  PossibleNodeConfigType,
  ProxyGroupModifier,
  ShadowsocksNodeConfig,
  ShadowsocksrNodeConfig,
  SimpleNodeConfig,
  SortedNodeNameFilterType,
  VmessNodeConfig,
} from '../types';
import { ERR_INVALID_FILTER, OBFS_UA } from '../constant';
import { validateFilter, applyFilter } from './filter';
import { formatVmessUri } from './v2ray';

export * from './surge';
export * from './clash';
export * from './quantumult';

const logger = createLogger({ service: 'surgio:utils' });

export const getDownloadUrl = (
  baseUrl = '/',
  artifactName: string,
  inline = true,
  accessToken?: string,
): string => {
  let urlSearchParams: URLSearchParams;
  let name: string;

  if (artifactName.includes('?')) {
    urlSearchParams = new URLSearchParams(artifactName.split('?')[1]);
    name = artifactName.split('?')[0];
  } else {
    urlSearchParams = new URLSearchParams();
    name = artifactName;
  }

  if (accessToken) {
    urlSearchParams.set('access_token', accessToken);
  }
  if (!inline) {
    urlSearchParams.set('dl', '1');
  }

  const query = urlSearchParams.toString();

  return `${baseUrl}${name}${query ? '?' + query : ''}`;
};

export const getUrl = (
  baseUrl: string,
  path: string,
  accessToken?: string,
): string => {
  path = path.replace(/^\//, '');
  const url = new URL(path, baseUrl);
  if (accessToken) {
    url.searchParams.set('access_token', accessToken);
  }
  return url.toString();
};

export const getMellowNodes = function (
  list: ReadonlyArray<VmessNodeConfig | ShadowsocksNodeConfig>,
  filter?: NodeFilterType | SortedNodeNameFilterType,
): string {
  // istanbul ignore next
  if (arguments.length === 2 && typeof filter === 'undefined') {
    throw new Error(ERR_INVALID_FILTER);
  }

  const result = applyFilter(list, filter)
    .map((nodeConfig) => {
      switch (nodeConfig.type) {
        case NodeTypeEnum.Vmess: {
          const uri = formatVmessUri(nodeConfig, { isMellow: true });
          return [
            nodeConfig.nodeName,
            'vmess1',
            uri.trim().replace('vmess://', 'vmess1://'),
          ].join(', ');
        }

        case NodeTypeEnum.Shadowsocks: {
          const uri = getShadowsocksNodes([nodeConfig]);
          return [nodeConfig.nodeName, 'ss', uri.trim()].join(', ');
        }

        // istanbul ignore next
        default:
          logger.warn(
            `不支持为 Mellow 生成 ${(nodeConfig as any).type} 的节点，节点 ${
              (nodeConfig as any).nodeName
            } 会被省略`,
          );
          return null;
      }
    })
    .filter((item) => !!item);

  return result.join('\n');
};

// istanbul ignore next
export const toUrlSafeBase64 = (str: string): string =>
  URLSafeBase64.encode(Buffer.from(str, 'utf8'));

// istanbul ignore next
export const fromUrlSafeBase64 = (str: string): string => {
  if (URLSafeBase64.validate(str)) {
    return URLSafeBase64.decode(str).toString();
  }
  return fromBase64(str);
};

// istanbul ignore next
export const toBase64 = (str: string): string =>
  Buffer.from(str, 'utf8').toString('base64');

// istanbul ignore next
export const fromBase64 = (str: string): string =>
  Buffer.from(str, 'base64').toString('utf8');

/**
 * @see https://github.com/shadowsocks/shadowsocks-org/wiki/SIP002-URI-Scheme
 */
export const getShadowsocksNodes = (
  list: ReadonlyArray<ShadowsocksNodeConfig>,
  groupName = 'Surgio',
): string => {
  const result: ReadonlyArray<any> = list
    .map((nodeConfig) => {
      // istanbul ignore next
      if (nodeConfig.enable === false) {
        return null;
      }

      switch (nodeConfig.type) {
        case NodeTypeEnum.Shadowsocks: {
          const config = _.cloneDeep(nodeConfig);
          const query: {
            readonly plugin?: string;
            readonly group?: string;
          } = {
            ...(config.obfs
              ? {
                  plugin: `${encodeURIComponent(
                    `obfs-local;obfs=${config.obfs};obfs-host=${config['obfs-host']}`,
                  )}`,
                }
              : null),
            ...(groupName ? { group: encodeURIComponent(groupName) } : null),
          };

          return [
            'ss://',
            toUrlSafeBase64(`${config.method}:${config.password}`),
            '@',
            config.hostname,
            ':',
            config.port,
            '/?',
            queryString.stringify(query, {
              encode: false,
              sort: false,
            }),
            '#',
            encodeURIComponent(config.nodeName),
          ].join('');
        }

        // istanbul ignore next
        default:
          logger.warn(
            `在生成 Shadowsocks 节点时出现了 ${nodeConfig.type} 节点，节点 ${nodeConfig.nodeName} 会被省略`,
          );
          return null;
      }
    })
    .filter((item) => !!item);

  return result.join('\n');
};

export const getShadowsocksrNodes = (
  list: ReadonlyArray<ShadowsocksrNodeConfig>,
  groupName: string,
): string => {
  const result: ReadonlyArray<string | undefined> = list
    .map((nodeConfig) => {
      // istanbul ignore next
      if (nodeConfig.enable === false) {
        return void 0;
      }

      switch (nodeConfig.type) {
        case NodeTypeEnum.Shadowsocksr: {
          const baseUri = [
            nodeConfig.hostname,
            nodeConfig.port,
            nodeConfig.protocol,
            nodeConfig.method,
            nodeConfig.obfs,
            toUrlSafeBase64(nodeConfig.password),
          ].join(':');
          const query = {
            obfsparam: toUrlSafeBase64(nodeConfig.obfsparam),
            protoparam: toUrlSafeBase64(nodeConfig.protoparam),
            remarks: toUrlSafeBase64(nodeConfig.nodeName),
            group: toUrlSafeBase64(groupName),
            udpport: 0,
            uot: 0,
          };

          return (
            'ssr://' +
            toUrlSafeBase64(
              [
                baseUri,
                '/?',
                queryString.stringify(query, {
                  encode: false,
                }),
              ].join(''),
            )
          );
        }

        // istanbul ignore next
        default:
          logger.warn(
            `在生成 Shadowsocksr 节点时出现了 ${nodeConfig.type} 节点，节点 ${nodeConfig.nodeName} 会被省略`,
          );
          return void 0;
      }
    })
    .filter((item) => item !== undefined);

  return result.join('\n');
};

export const getV2rayNNodes = (
  list: ReadonlyArray<VmessNodeConfig>,
): string => {
  const result: ReadonlyArray<string> = list
    .map((nodeConfig): string | undefined => {
      // istanbul ignore next
      if (nodeConfig.enable === false) {
        return void 0;
      }

      switch (nodeConfig.type) {
        case NodeTypeEnum.Vmess: {
          const json = {
            v: '2',
            ps: nodeConfig.nodeName,
            add: nodeConfig.hostname,
            port: `${nodeConfig.port}`,
            id: nodeConfig.uuid,
            aid: nodeConfig.alterId,
            net: nodeConfig.network,
            type: 'none',
            host: nodeConfig.host,
            path: nodeConfig.path,
            tls: nodeConfig.tls ? 'tls' : '',
          };

          return 'vmess://' + toBase64(JSON.stringify(json));
        }

        // istanbul ignore next
        default:
          logger.warn(
            `在生成 V2Ray 节点时出现了 ${nodeConfig.type} 节点，节点 ${nodeConfig.nodeName} 会被省略`,
          );
          return void 0;
      }
    })
    .filter((item): item is string => item !== undefined);

  return result.join('\n');
};

// istanbul ignore next
export const getShadowsocksNodesJSON = (
  list: ReadonlyArray<ShadowsocksNodeConfig>,
): string => {
  const nodes: ReadonlyArray<any> = list
    .map((nodeConfig) => {
      // istanbul ignore next
      if (nodeConfig.enable === false) {
        return null;
      }

      switch (nodeConfig.type) {
        case NodeTypeEnum.Shadowsocks: {
          const useObfs = Boolean(nodeConfig.obfs && nodeConfig['obfs-host']);
          return {
            remarks: nodeConfig.nodeName,
            server: nodeConfig.hostname,
            server_port: nodeConfig.port,
            method: nodeConfig.method,
            remarks_base64: toUrlSafeBase64(nodeConfig.nodeName),
            password: nodeConfig.password,
            tcp_over_udp: false,
            udp_over_tcp: false,
            enable: true,
            ...(useObfs
              ? {
                  plugin: 'obfs-local',
                  'plugin-opts': `obfs=${nodeConfig.obfs};obfs-host=${nodeConfig['obfs-host']}`,
                }
              : null),
          };
        }

        // istanbul ignore next
        default:
          logger.warn(
            `在生成 Shadowsocks 节点时出现了 ${nodeConfig.type} 节点，节点 ${nodeConfig.nodeName} 会被省略`,
          );
          return undefined;
      }
    })
    .filter((item) => item !== undefined);

  return JSON.stringify(nodes, null, 2);
};

export const getNodeNames = function (
  list: ReadonlyArray<SimpleNodeConfig>,
  filter?: NodeNameFilterType | SortedNodeNameFilterType,
  separator?: string,
): string {
  // istanbul ignore next
  if (arguments.length === 2 && typeof filter === 'undefined') {
    throw new Error(ERR_INVALID_FILTER);
  }

  return applyFilter(list, filter)
    .map((item) => item.nodeName)
    .join(separator || ', ');
};

export const generateClashProxyGroup = (
  ruleName: string,
  ruleType: 'select' | 'url-test' | 'fallback' | 'load-balance',
  nodeNameList: ReadonlyArray<SimpleNodeConfig>,
  options: {
    readonly filter?: NodeNameFilterType | SortedNodeNameFilterType;
    readonly existingProxies?: ReadonlyArray<string>;
    readonly proxyTestUrl?: string;
    readonly proxyTestInterval?: number;
  },
): {
  readonly type: string;
  readonly name: string;
  readonly proxies: readonly string[];
  readonly url?: string;
  readonly interval?: number;
} => {
  let proxies;

  if (options.existingProxies) {
    if (options.filter) {
      const nodes = applyFilter(nodeNameList, options.filter);
      proxies = ([] as string[]).concat(
        options.existingProxies,
        nodes.map((item) => item.nodeName),
      );
    } else {
      proxies = options.existingProxies;
    }
  } else {
    const nodes = applyFilter(nodeNameList, options.filter);
    proxies = nodes.map((item) => item.nodeName);
  }

  return {
    type: ruleType,
    name: ruleName,
    proxies,
    ...(['url-test', 'fallback', 'load-balance'].includes(ruleType)
      ? {
          url: options.proxyTestUrl,
          interval: options.proxyTestInterval,
        }
      : null),
  };
};

export const toYaml = (obj: JsonObject): string => YAML.stringify(obj);

export const pickAndFormatStringList = (
  obj: any,
  keyList: readonly string[],
): readonly string[] => {
  const result: string[] = [];
  keyList.forEach((key) => {
    if (obj.hasOwnProperty(key)) {
      result.push(`${key}=${obj[key]}`);
    }
  });
  return result;
};

export const decodeStringList = <T = Record<string, string | boolean>>(
  stringList: ReadonlyArray<string>,
): T => {
  const result = {};
  stringList.forEach((item) => {
    if (item.includes('=')) {
      const match = item.match(/^(.*?)=(.*?)$/);
      if (match) {
        result[match[1].trim()] = match[2].trim() || true;
      }
    } else {
      result[item.trim()] = true;
    }
  });
  return result as T;
};

export const normalizeClashProxyGroupConfig = (
  nodeList: ReadonlyArray<PossibleNodeConfigType>,
  customFilters: PlainObjectOf<NodeNameFilterType | SortedNodeNameFilterType>,
  proxyGroupModifier: ProxyGroupModifier,
  options: {
    readonly proxyTestUrl?: string;
    readonly proxyTestInterval?: number;
  } = {},
): ReadonlyArray<any> => {
  const proxyGroup = proxyGroupModifier(nodeList, customFilters);

  return proxyGroup.map((item) => {
    if (item.hasOwnProperty('filter')) {
      // istanbul ignore next
      if (!item.filter || !validateFilter(item.filter)) {
        throw new Error(
          `过滤器 ${item.filter} 无效，请检查 proxyGroupModifier`,
        );
      }

      return generateClashProxyGroup(item.name, item.type, nodeList, {
        filter: item.filter,
        existingProxies: item.proxies,
        proxyTestUrl: options.proxyTestUrl,
        proxyTestInterval: options.proxyTestInterval,
      });
    } else {
      return generateClashProxyGroup(item.name, item.type, nodeList, {
        existingProxies: item.proxies,
        proxyTestUrl: options.proxyTestUrl,
        proxyTestInterval: options.proxyTestInterval,
      });
    }
  });
};

export const ensureConfigFolder = (dir: string = os.homedir()): string => {
  let baseDir;

  try {
    fs.accessSync(dir, fs.constants.W_OK);
    baseDir = dir;
  } catch (err) {
    // if the user do not have write permission
    // istanbul ignore next
    baseDir = '/tmp';
  }

  const configDir = join(baseDir, '.config/surgio');
  fs.mkdirpSync(configDir);
  return configDir;
};

export const formatV2rayConfig = (
  localPort: number,
  nodeConfig: VmessNodeConfig,
): JsonObject => {
  const config: any = {
    log: {
      loglevel: 'warning',
    },
    inbound: {
      port: Number(localPort),
      listen: '127.0.0.1',
      protocol: 'socks',
      settings: {
        auth: 'noauth',
      },
    },
    outbound: {
      protocol: 'vmess',
      settings: {
        vnext: [
          {
            address: nodeConfig.hostname,
            port: Number(nodeConfig.port),
            users: [
              {
                id: nodeConfig.uuid,
                alterId: Number(nodeConfig.alterId),
                security: nodeConfig.method,
                level: 0,
              },
            ],
          },
        ],
      },
      streamSettings: {
        security: 'none',
      },
    },
  };

  if (nodeConfig.tls) {
    config.outbound.streamSettings = {
      ...config.outbound.streamSettings,
      security: 'tls',
      tlsSettings: {
        serverName: nodeConfig.host || nodeConfig.hostname,
        ...(typeof nodeConfig.skipCertVerify === 'boolean'
          ? {
              allowInsecure: nodeConfig.skipCertVerify,
            }
          : null),
        ...(typeof nodeConfig.tls13 === 'boolean'
          ? {
              allowInsecureCiphers: !nodeConfig.tls13,
            }
          : null),
      },
    };
  }

  if (nodeConfig.network === 'ws') {
    config.outbound.streamSettings = {
      ...config.outbound.streamSettings,
      network: nodeConfig.network,
      wsSettings: {
        path: nodeConfig.path,
        headers: {
          Host: nodeConfig.host,
          'User-Agent': OBFS_UA,
        },
      },
    };
  }

  return config;
};

export const lowercaseHeaderKeys = (
  headers: Record<string, string>,
): Record<string, string> => {
  const wsHeaders = {};

  Object.keys(headers).forEach((key) => {
    wsHeaders[key.toLowerCase()] = headers[key];
  });

  return wsHeaders;
};

export const msToSeconds = (ms: number): number => Math.floor(ms / 1000);

// istanbul ignore next
export const isIp = (str: string): boolean =>
  net.isIPv4(str) || net.isIPv6(str);

// istanbul ignore next
export const isNow = (): boolean =>
  typeof process.env.NOW_REGION !== 'undefined' ||
  typeof process.env.VERCEL_REGION !== 'undefined';

// istanbul ignore next
export const isVercel = (): boolean => isNow();

// istanbul ignore next
export const isHeroku = (): boolean => typeof process.env.DYNO !== 'undefined';

// istanbul ignore next
export const isGitHubActions = (): boolean =>
  typeof process.env.GITHUB_ACTIONS !== 'undefined';

// istanbul ignore next
export const isGitLabCI = (): boolean =>
  typeof process.env.GITLAB_CI !== 'undefined';

// istanbul ignore next
export const isPkgBundle = (): boolean => __dirname.startsWith('/snapshot');

// istanbul ignore next
export const isRailway = (): boolean =>
  typeof process.env.RAILWAY_STATIC_URL !== 'undefined';

// istanbul ignore next
export const isNetlify = (): boolean =>
  typeof process.env.NETLIFY !== 'undefined';
