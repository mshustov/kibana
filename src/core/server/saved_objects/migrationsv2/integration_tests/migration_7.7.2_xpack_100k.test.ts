/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { join } from 'path';
import { REPO_ROOT } from '@kbn/dev-utils';
import { Env } from '@kbn/config';
import { getEnvOptions } from '@kbn/config/target/mocks';
import * as kbnTestServer from '../../../../test_helpers/kbn_server';
import { ElasticsearchClient } from '../../../elasticsearch';
import { InternalCoreStart } from '../../../internal_types';
import { Root } from '../../../root';

const kibanaVersion = Env.createDefault(REPO_ROOT, getEnvOptions()).packageInfo.version;

describe('migration from 7.7.2-xpack with 100k objects', () => {
  let esServer: kbnTestServer.TestElasticsearchUtils;
  let root: Root;
  let coreStart: InternalCoreStart;
  let esClient: ElasticsearchClient;

  beforeEach(() => {
    jest.setTimeout(600000);
  });

  const startServers = async ({ dataArchive, oss }: { dataArchive: string; oss: boolean }) => {
    const { startES } = kbnTestServer.createTestServers({
      adjustTimeout: (t: number) => jest.setTimeout(600000),
      settings: {
        es: {
          license: 'trial',
          dataArchive,
        },
      },
    });

    root = kbnTestServer.createRootWithCorePlugins(
      {
        migrations: {
          skip: false,
          enableV2: true,
        },
        logging: {
          appenders: {
            file: {
              type: 'file',
              fileName: join(__dirname, 'migration_test_kibana.log'),
              layout: {
                type: 'json',
              },
            },
          },
          loggers: [
            {
              name: 'root',
              appenders: ['file'],
            },
          ],
        },
      },
      {
        oss,
      }
    );

    const startEsPromise = startES().then((es) => (esServer = es));
    const startKibanaPromise = root
      .setup()
      .then(() => root.start())
      .then((start) => {
        coreStart = start;
        esClient = coreStart.elasticsearch.client.asInternalUser;
      });

    await Promise.all([startEsPromise, startKibanaPromise]);
  };

  const stopServers = async () => {
    if (root) {
      await root.shutdown();
    }
    if (esServer) {
      await esServer.stop();
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));
  };

  const migratedIndex = `.kibana_${kibanaVersion}_001`;

  beforeAll(async () => {
    await startServers({
      oss: false,
      dataArchive: join(__dirname, 'archives', '7.7.2_xpack_100k_obj.zip'),
    });
  });

  afterAll(async () => {
    await stopServers();
  });

  it('copies all the document of the previous index to the new one', async () => {
    console.time('createPipeline');
    /**
     * We use ingest pipeline to create a script since it's the only API
     * when painless provides access to hashing functions sha1 and sha256
     * https://github.com/elastic/elasticsearch/issues/61244#issuecomment-675514000
     * examples:
     * https://github.com/elastic/elasticsearch/pull/59671#issuecomment-659467724
     * https://github.com/elastic/elasticsearch/pull/63375/files#diff-2f417b71ec83e11b4254559f37098b86a111298279bf600332b17d376b0a8357
     * but in theory it can have inconsistent order of keys https://github.com/elastic/elasticsearch/issues/34085
     *
     * Other alternatives:
     * - use base64 https://github.com/elastic/elasticsearch/pull/22665 creates a long id, not practical
     * - use _source.hashCode can produce inconsistent result on different machines https://eclipsesource.com/blogs/2012/09/04/the-3-things-you-should-know-about-hashcode/
     */
    const response = esClient.ingest.putPipeline({
      id: 'id-hash-generator',
      body: {
        processors: [
          {
            script: {
              // available Painless API https://www.elastic.co/guide/en/elasticsearch/painless/master/painless-api-reference-shared-java-lang.html
              lang: 'painless',
              /**
               * Need more work to implement it properly. Right now, the result is not idempotent
               * because pipeline context includes dynamic fields created during ingestion.
               * We need to find a way to filter them out to use the document for hashing.
               * For more details about ingestion context, see
               * https://www.elastic.co/guide/en/elasticsearch/painless/master/painless-ingest-processor-context.html
               */
              source: 'ctx._id = ctx.toString().sha256()',
            },
          },
        ],
      },
    });
    console.timeEnd('createPipeline');
    console.log('@@@createPipeline response', response);

    console.time('reindexES');
    const reindexDest = 'migration_es_dest';
    /**
     * Run reindex with 'id-hash-generator' pipeline to create idempotent _id based on _source HashMap.
     */
    const reindexResponse = await esClient.reindex({
      wait_for_completion: true,
      body: {
        source: { index: migratedIndex },
        dest: {
          index: reindexDest,
          pipeline: 'id-hash-generator',
        },
      },
    });
    console.timeEnd('reindexES');
    console.log('@@@reindexES response', reindexResponse);

    const migratedIndexResponse = await esClient.count({
      index: reindexDest,
    });
    // const migratedIndexResponse = await esClient.count({
    //   index: migratedIndex,
    // });
    //
    const oldIndexResponse = await esClient.count({
      index: '.kibana_1',
    });

    expect(migratedIndexResponse.body.count).toBeGreaterThanOrEqual(oldIndexResponse.body.count);
  });
});
