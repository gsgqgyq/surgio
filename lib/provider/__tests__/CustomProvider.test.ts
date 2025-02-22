import test from 'ava';
import { ValidationError } from 'joi';

import { NodeTypeEnum, SupportProviderEnum } from '../../types';
import CustomProvider from '../CustomProvider';

test('CustomProvider should work', async (t) => {
  const provider = new CustomProvider('test', {
    type: SupportProviderEnum.Custom,
    nodeList: [],
  });

  t.deepEqual(await provider.getNodeList(), []);
});

test('CustomProvider should throw error if udp-relay is a string', async (t) => {
  const provider = new CustomProvider('test', {
    type: SupportProviderEnum.Custom,
    nodeList: [
      {
        type: NodeTypeEnum.Shadowsocks,
        nodeName: 'test',
        'udp-relay': 'true',
      },
    ],
  });

  return t.throwsAsync(
    async () => {
      await provider.getNodeList();
    },
    {
      instanceOf: ValidationError,
      message: '"udp-relay" must be a boolean',
    },
  );
});

test('CustomProvider should format header keys to lowercase', async (t) => {
  const provider = new CustomProvider('test', {
    type: SupportProviderEnum.Custom,
    nodeList: [
      {
        type: NodeTypeEnum.Shadowsocks,
        nodeName: 'test',
        wsHeaders: {
          Host: 'Example.com',
        },
      },
    ],
  });

  t.deepEqual(await provider.getNodeList(), [
    {
      type: NodeTypeEnum.Shadowsocks,
      nodeName: 'test',
      wsHeaders: {
        host: 'Example.com',
      },
    },
  ]);
});
