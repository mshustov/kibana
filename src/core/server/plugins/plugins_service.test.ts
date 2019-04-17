/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { mockPackage } from './plugins_service.test.mocks';

import { BehaviorSubject } from 'rxjs';

import { Env } from '../config';
import { configServiceMock } from '../config/config_service.mock';
import { getEnvOptions } from '../config/__mocks__/env';
import { elasticsearchServiceMock } from '../elasticsearch/elasticsearch_service.mock';
import { loggingServiceMock } from '../logging/logging_service.mock';
import { PluginDiscoveryError } from './discovery';
import { PluginWrapper } from './plugin';

import { PluginsService } from './plugins_service';
import { PluginsSystem } from './plugins_system';

const MockPluginsSystem: jest.Mock<PluginsSystem> = PluginsSystem as any;

let pluginsService: PluginsService;
const configService = configServiceMock.create();
let env: Env;
let mockPluginSystem: jest.Mocked<PluginsSystem>;
const setupDeps = { elasticsearch: elasticsearchServiceMock.createSetupContract() };
const logger = loggingServiceMock.create();
const config$ = new BehaviorSubject(Object.freeze({ initialize: true, paths: [] }));
beforeEach(() => {
  mockPackage.raw = {
    branch: 'feature-v1',
    version: 'v1',
    build: {
      distributable: true,
      number: 100,
      sha: 'feature-v1-build-sha',
    },
  };

  env = Env.createDefault(getEnvOptions());

  pluginsService = new PluginsService(
    { env, logger, configService: configService as any },
    config$
  );

  [mockPluginSystem] = MockPluginsSystem.mock.instances as any;
});

afterEach(() => {
  jest.clearAllMocks();
});

test('`setup` throws if plugin has an invalid manifest', async () => {
  const plugins = {
    pluginDefinitions: [],
    errors: [PluginDiscoveryError.invalidManifest('path-1', new Error('Invalid JSON'))],
  };
  await expect(pluginsService.setup(setupDeps, plugins)).rejects.toMatchInlineSnapshot(`
[Error: Failed to initialize plugins:
	Invalid JSON (invalid-manifest, path-1)]
`);
  expect(loggingServiceMock.collect(logger).error).toMatchInlineSnapshot(`
Array [
  Array [
    [Error: Invalid JSON (invalid-manifest, path-1)],
  ],
]
`);
});

test('`setup` throws if plugin required Kibana version is incompatible with the current version', async () => {
  const plugins = {
    pluginDefinitions: [],
    errors: [PluginDiscoveryError.incompatibleVersion('path-3', new Error('Incompatible version'))],
  };
  await expect(pluginsService.setup(setupDeps, plugins)).rejects.toMatchInlineSnapshot(`
[Error: Failed to initialize plugins:
	Incompatible version (incompatible-version, path-3)]
`);
  expect(loggingServiceMock.collect(logger).error).toMatchInlineSnapshot(`
Array [
  Array [
    [Error: Incompatible version (incompatible-version, path-3)],
  ],
]
`);
});

// eslint-disable-next-line
test('`setup` throws if discovered plugins with conflicting names', async () => {
  configService.isEnabledAtPath.mockResolvedValue(true);
  const plugins = {
    pluginDefinitions: [
      {
        path: 'path-4',
        manifest: {
          id: 'conflicting-id',
          version: 'some-version',
          configPath: 'path',
          kibanaVersion: '7.0.0',
          requiredPlugins: ['some-required-plugin', 'some-required-plugin-2'],
          optionalPlugins: ['some-optional-plugin'],
          server: true,
          ui: true,
        },
      },
      {
        path: 'path-5',
        manifest: {
          id: 'conflicting-id',
          version: 'some-other-version',
          configPath: ['plugin', 'path'],
          kibanaVersion: '7.0.0',
          requiredPlugins: ['some-required-plugin'],
          optionalPlugins: [],
          server: true,
          ui: false,
        },
      },
    ],
    errors: [],
  };

  await expect(pluginsService.setup(setupDeps, plugins)).rejects.toMatchInlineSnapshot(
    `[Error: Plugin with id "conflicting-id" is already registered!]`
  );

  expect(mockPluginSystem.addPlugin).not.toHaveBeenCalled();
  expect(mockPluginSystem.setupPlugins).not.toHaveBeenCalled();
});

test('`setup` properly detects plugins that should be disabled.', async () => {
  configService.isEnabledAtPath.mockImplementation(path =>
    Promise.resolve(!path.includes('disabled'))
  );

  mockPluginSystem.setupPlugins.mockResolvedValue(new Map());
  mockPluginSystem.uiPlugins.mockReturnValue({ public: new Map(), internal: new Map() });

  const plugins = {
    pluginDefinitions: [
      {
        path: 'path-1',
        manifest: {
          id: 'explicitly-disabled-plugin',
          version: 'some-version',
          configPath: 'path-1-disabled',
          kibanaVersion: '7.0.0',
          requiredPlugins: [],
          optionalPlugins: [],
          server: true,
          ui: true,
        },
      },
      {
        path: 'path-2',
        manifest: {
          id: 'plugin-with-missing-required-deps',
          version: 'some-version',
          configPath: 'path-2',
          kibanaVersion: '7.0.0',
          requiredPlugins: ['missing-plugin'],
          optionalPlugins: [],
          server: true,
          ui: true,
        },
      },
      {
        path: 'path-3',
        manifest: {
          id: 'plugin-with-disabled-transitive-dep',
          version: 'some-version',
          configPath: 'path-3',
          kibanaVersion: '7.0.0',
          requiredPlugins: ['another-explicitly-disabled-plugin'],
          optionalPlugins: [],
          server: true,
          ui: true,
        },
      },
      {
        path: 'path-4',
        manifest: {
          id: 'another-explicitly-disabled-plugin',
          version: 'some-version',
          configPath: 'path-4-disabled',
          kibanaVersion: '7.0.0',
          requiredPlugins: [],
          optionalPlugins: [],
          server: true,
          ui: true,
        },
      },
    ],
    errors: [],
  };

  const start = await pluginsService.setup(setupDeps, plugins);

  expect(start.contracts).toBeInstanceOf(Map);
  expect(start.uiPlugins.public).toBeInstanceOf(Map);
  expect(start.uiPlugins.internal).toBeInstanceOf(Map);
  expect(mockPluginSystem.addPlugin).not.toHaveBeenCalled();
  expect(mockPluginSystem.setupPlugins).toHaveBeenCalledTimes(1);
  expect(mockPluginSystem.setupPlugins).toHaveBeenCalledWith(setupDeps);

  expect(loggingServiceMock.collect(logger).info).toMatchInlineSnapshot(`
Array [
  Array [
    "Plugin \\"explicitly-disabled-plugin\\" is disabled.",
  ],
  Array [
    "Plugin \\"plugin-with-missing-required-deps\\" has been disabled since some of its direct or transitive dependencies are missing or disabled.",
  ],
  Array [
    "Plugin \\"plugin-with-disabled-transitive-dep\\" has been disabled since some of its direct or transitive dependencies are missing or disabled.",
  ],
  Array [
    "Plugin \\"another-explicitly-disabled-plugin\\" is disabled.",
  ],
]
`);
});

test('`setup` properly invokes `discover` and ignores non-critical errors.', async () => {
  const firstPlugin = {
    path: 'path-1',
    manifest: {
      id: 'some-id',
      version: 'some-version',
      configPath: 'path',
      kibanaVersion: '7.0.0',
      requiredPlugins: ['some-other-id'],
      optionalPlugins: ['missing-optional-dep'],
      server: true,
      ui: true,
    },
  };
  const secondPlugin = {
    path: 'path-2',
    manifest: {
      id: 'some-other-id',
      version: 'some-other-version',
      configPath: ['plugin', 'path'],
      kibanaVersion: '7.0.0',
      requiredPlugins: [],
      optionalPlugins: [],
      server: true,
      ui: false,
    },
  };
  const plugins = {
    pluginDefinitions: [firstPlugin, secondPlugin],
    errors: [
      PluginDiscoveryError.missingManifest('path-2', new Error('No manifest')),
      PluginDiscoveryError.invalidSearchPath('dir-1', new Error('No dir')),
      PluginDiscoveryError.invalidPluginPath('path4-1', new Error('No path')),
    ],
  };

  const contracts = new Map();
  const discoveredPlugins = { public: new Map(), internal: new Map() };
  mockPluginSystem.setupPlugins.mockResolvedValue(contracts);
  mockPluginSystem.uiPlugins.mockReturnValue(discoveredPlugins);

  const setup = await pluginsService.setup(setupDeps, plugins);

  expect(setup.contracts).toBe(contracts);
  expect(setup.uiPlugins).toBe(discoveredPlugins);
  expect(mockPluginSystem.addPlugin).toHaveBeenCalledTimes(2);

  expect(mockPluginSystem.addPlugin.mock.calls[0][0]).toBeInstanceOf(PluginWrapper);
  expect(mockPluginSystem.addPlugin.mock.calls[0][0].path).toBe('path-1');
  expect(mockPluginSystem.addPlugin.mock.calls[1][0]).toBeInstanceOf(PluginWrapper);
  expect(mockPluginSystem.addPlugin.mock.calls[1][0].path).toBe('path-2');

  const logs = loggingServiceMock.collect(logger);
  expect(logs.info).toHaveLength(0);
  expect(logs.error).toHaveLength(0);
});

test('`stop` stops plugins system', async () => {
  await pluginsService.stop();
  expect(mockPluginSystem.stopPlugins).toHaveBeenCalledTimes(1);
});
