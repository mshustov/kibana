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
import expect from '@kbn/expect';
import { tap } from 'rxjs/operators';
import { ToolingLogTextWriter } from '@kbn/dev-utils';

export default function ({ getService }) {
  describe('log', async () => {
    const log = getService('log');
    const supertest = getService('supertest');
    let originalWriters;
    before(() => {
      originalWriters = log.getWriters();
    });
    after(() => {
      log.setWriters(originalWriters);
    });

    it('info', async () => {
      const result = [];
      log.setWriters([
        new ToolingLogTextWriter({
          level: 'info',
          writeTo: {
            write: line => {
              result.push(line);
            }
          }
        }),
      ]);

      const result2 = [];
      log.getWritten$()
        .pipe(
          tap((value) => {
            result2.push(value);
          })
        );

      await supertest
        .get('/logging/json/info')
        .expect(200);

      console.log('values', result, result2);
      expect(result).to.eql([]);
      expect(result2).to.eql([]);
    });
  });
}
