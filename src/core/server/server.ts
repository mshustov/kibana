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
import { Observable } from 'rxjs';
import { first } from 'rxjs/operators';
import { Type } from '@kbn/config-schema';

import { ConfigService, Env, Config, ConfigPath } from './config';
import { ElasticsearchService } from './elasticsearch';
import { HttpService, HttpServiceSetup, Router } from './http';
import { LegacyService } from './legacy';
import { Logger, LoggerFactory } from './logging';
import {
  PluginsService,
  DiscoveredPluginsDefinitions,
  configDefinition as pluginsConfigDefinition,
} from './plugins';

import { configDefinition as elasticsearchConfigDefinition } from './elasticsearch';
import { configDefinition as httpConfigDefinition } from './http';
import { configDefinition as loggingConfigDefinition } from './logging';
import { configDefinition as devConfigDefinition } from './dev';

export class Server {
  public readonly configService: ConfigService;
  private readonly elasticsearch: ElasticsearchService;
  private readonly http: HttpService;
  private readonly plugins: PluginsService;
  private readonly legacy: LegacyService;
  private readonly log: Logger;

  constructor(
    private readonly config$: Observable<Config>,
    private readonly env: Env,
    private readonly logger: LoggerFactory
  ) {
    this.log = this.logger.get('server');
    this.configService = new ConfigService(config$, env, logger);

    const core = { configService: this.configService, env, logger };
    this.http = new HttpService(core);
    this.plugins = new PluginsService(core);
    this.legacy = new LegacyService(core);
    this.elasticsearch = new ElasticsearchService(core);
  }

  public async preSetup() {
    this.log.debug('pre-setup server');
    const config = await this.config$.pipe(first()).toPromise();
    const hasDevPaths = Boolean(config.get('plugins') && config.get('plugins').paths);
    const devPluginPaths = this.env.mode.dev && hasDevPaths ? config.get('plugins').paths : [];

    const pluginDefinitions = await this.plugins.preSetup(devPluginPaths);
    const schemas = this.getSchemas(pluginDefinitions);

    this.configService.setValidationSchemas(schemas);
    await this.configService.validateAll();
  }

  public async setup() {
    this.log.debug('setting up server');

    const httpSetup = await this.http.setup();
    this.registerDefaultRoute(httpSetup);

    const elasticsearchServiceSetup = await this.elasticsearch.setup();

    const pluginsSetup = await this.plugins.setup({
      elasticsearch: elasticsearchServiceSetup,
      http: httpSetup,
    });

    const coreSetup = {
      elasticsearch: elasticsearchServiceSetup,
      http: httpSetup,
      plugins: pluginsSetup,
    };

    await this.legacy.setup(coreSetup);

    return coreSetup;
  }

  public async start() {
    const httpStart = await this.http.start();
    const plugins = await this.plugins.start({});

    const startDeps = {
      http: httpStart,
      plugins,
    };

    await this.legacy.start(startDeps);

    return startDeps;
  }

  public async stop() {
    this.log.debug('stopping server');

    await this.legacy.stop();
    await this.plugins.stop();
    await this.elasticsearch.stop();
    await this.http.stop();
  }

  private getSchemas(pluginDefinitions: DiscoveredPluginsDefinitions) {
    const pluginConfigSchemas = new Map(
      pluginDefinitions.pluginDefinitions
        .filter(pluginDef => Boolean(pluginDef.schema))
        .map(
          pluginDef =>
            [pluginDef.manifest.configPath, pluginDef.schema!] as [ConfigPath, Type<unknown>]
        )
    );

    const coreConfigSchemas = new Map<ConfigPath, Type<unknown>>([
      [elasticsearchConfigDefinition.configPath, elasticsearchConfigDefinition.schema],
      [loggingConfigDefinition.configPath, loggingConfigDefinition.schema],
      [httpConfigDefinition.configPath, httpConfigDefinition.schema],
      [pluginsConfigDefinition.configPath, pluginsConfigDefinition.schema],
      [devConfigDefinition.configPath, devConfigDefinition.schema],
    ]);

    return new Map([...pluginConfigSchemas, ...coreConfigSchemas]);
  }

  private registerDefaultRoute(httpSetup: HttpServiceSetup) {
    const router = new Router('/core');
    router.get({ path: '/', validate: false }, async (req, res) => res.ok({ version: '0.0.1' }));
    httpSetup.registerRouter(router);
  }
}
