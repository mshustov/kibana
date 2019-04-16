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
import fs from 'fs';
import path from 'path';
import { Type } from '@kbn/config-schema';
import { Env } from '../../config';
import { parseManifest, isNewPlatformPlugin } from './plugin_manifest_parser';
import { PluginDiscoveryError } from './plugin_discovery_error';
import { PluginManifest } from '../plugin';

function isDirExists(candidatePath: string) {
  try {
    const stat = fs.statSync(candidatePath);
    return stat.isDirectory(); // can be declared as a file?
  } catch (e) {
    return false;
  }
}

function readSchema(pluginPath: string) {
  const pluginPathServer = path.join(pluginPath, 'server');
  // there could be only UI plugin without server part and config
  if (!isDirExists(pluginPathServer)) return;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pluginDefinition = require(pluginPathServer);

  if (!('configDefinition' in pluginDefinition)) {
    // eslint-disable-next-line no-console
    console.log(`"${pluginPathServer}" does not export "configDefinition" definition.`);
    return;
  }

  const configSchema: Type<unknown> = pluginDefinition.configDefinition.schema;
  if (configSchema && typeof configSchema.validate !== 'function') {
    // TODO make PluginDiscoveryError or explicitly invalid schema error
    throw new Error(
      `The config definition for plugin [${pluginPathServer}] did not contain a static 'schema' field, which is required when validating a config instance`
    );
  }
  return configSchema;
}

function getSubfolders(source: string) {
  try {
    return fs
      .readdirSync(source)
      .map(subPath => path.join(source, subPath))
      .filter(fullPath => fs.statSync(fullPath).isDirectory());
  } catch (error) {
    return PluginDiscoveryError.invalidSearchPath(source, error);
  }
}

export interface PluginDefinition {
  path: string;
  manifest: PluginManifest;
  schema?: Type<unknown>;
}

export interface DiscoveredPluginsDefinitions {
  pluginDefinitions: PluginDefinition[];
  errors: PluginDiscoveryError[];
}

/**
 * Iterates over every plugin search path, try to read plugin directories
 * to gather collection of plugin definitions.
 * If directory cannot be read or it's impossible to get stat
 * for any of the nested entries then error is accumulated in error collection.
 * Returns lists of plugin definitions and discovery errors.
 */
export async function discover(
  pluginSearchPaths: ReadonlyArray<string>,
  devPluginPaths: ReadonlyArray<string>,
  env: Env
) {
  const pluginDefinitions: PluginDefinition[] = [];
  const errors: PluginDiscoveryError[] = [];
  const pluginFolderPaths = [...pluginSearchPaths, ...devPluginPaths].map(getSubfolders);

  for (const pluginFolderPath of pluginFolderPaths) {
    if (pluginFolderPath instanceof PluginDiscoveryError) {
      errors.push(pluginFolderPath);
      continue;
    }

    for (const pluginPath of pluginFolderPath) {
      if (!(await isNewPlatformPlugin(pluginPath))) continue;
      try {
        const manifest = await parseManifest(pluginPath, env.packageInfo);
        const schema = readSchema(pluginPath);
        pluginDefinitions.push({
          path: pluginPath,
          manifest,
          schema,
        });
      } catch (error) {
        if (error instanceof PluginDiscoveryError) {
          errors.push(error);
        } else {
          throw error;
        }
      }
    }
  }
  return { pluginDefinitions, errors };
}
