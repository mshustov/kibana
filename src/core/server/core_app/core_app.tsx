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
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { EuiButton } from '@elastic/eui/lib/components/button';
import { EuiPage, EuiPageBody, EuiPageContent } from '@elastic/eui/lib/components/page';
import { EuiEmptyPrompt } from '@elastic/eui/lib/components/empty_prompt';

import * as UiSharedDeps from '@kbn/ui-shared-deps';
import { FormattedMessage, I18nProvider } from '@kbn/i18n/react';

import Path from 'path';
import { fromRoot } from '../../../core/server/utils';
import { InternalCoreSetup } from '../internal_types';
import { CoreContext } from '../core_context';
import { Logger } from '../logging';

function ResetSessionPage({
  logoutUrl,
  styleSheetPaths,
}: {
  logoutUrl: string;
  styleSheetPaths: string[];
}) {
  return (
    <html lang="en">
      <head>
        <React.Fragment>
          {styleSheetPaths.map((path) => (
            <link href={path} rel="stylesheet" />
          ))}
        </React.Fragment>
      </head>
      <body>
        <I18nProvider>
          <EuiPage style={{ minHeight: '100vh' }}>
            <EuiPageBody>
              <EuiPageContent verticalPosition="center" horizontalPosition="center">
                <EuiEmptyPrompt
                  /* TODO fix icon rendering */
                  iconType="alert"
                  iconColor="danger"
                  title={
                    <h2>
                      <FormattedMessage
                        id="xpack.security.resetSession.title"
                        defaultMessage="You do not have permission to access the requested page - default message"
                      />
                    </h2>
                  }
                  body={
                    <p>
                      <FormattedMessage
                        id="xpack.security.resetSession.description"
                        defaultMessage="Either go back to the previous page or log in as a different user."
                      />
                    </p>
                  }
                  actions={[
                    <EuiButton
                      color="primary"
                      fill
                      href={logoutUrl}
                      data-test-subj="ResetSessionButton"
                    >
                      <FormattedMessage
                        id="xpack.security.resetSession.LogOutButtonLabel"
                        defaultMessage="Log in as different user"
                      />
                    </EuiButton>,
                  ]}
                />
              </EuiPageContent>
            </EuiPageBody>
          </EuiPage>
        </I18nProvider>
      </body>
    </html>
  );
}

/** @internal */
export class CoreApp {
  private readonly logger: Logger;
  constructor(private readonly context: CoreContext) {
    this.logger = context.logger.get('core-app');
  }
  setup(coreSetup: InternalCoreSetup) {
    this.logger.debug('Setting up core app.');
    this.registerDefaultRoutes(coreSetup);
    this.registerStaticDirs(coreSetup);
  }

  private registerDefaultRoutes(coreSetup: InternalCoreSetup) {
    const httpSetup = coreSetup.http;
    const router = httpSetup.createRouter('/');
    router.get({ path: '/', validate: false }, async (context, req, res) => {
      const defaultRoute = await context.core.uiSettings.client.get<string>('defaultRoute');
      const basePath = httpSetup.basePath.get(req);
      const url = `${basePath}${defaultRoute}`;

      return res.redirected({
        headers: {
          location: url,
        },
      });
    });

    router.get({ path: '/core', validate: false }, async (context, req, res) => {
      const basePath = httpSetup.basePath.get(req);
      const buildHash = this.context.env.packageInfo.buildNum;
      const regularBundlePath = `${basePath}/${buildHash}/bundles`;

      // TODO add fonts, csp rules
      const styleSheetPaths = [
        `${regularBundlePath}/kbn-ui-shared-deps/${UiSharedDeps.baseCssDistFilename}`,
        `${regularBundlePath}/kbn-ui-shared-deps/${UiSharedDeps.lightCssDistFilename}`,
        `${basePath}/node_modules/@kbn/ui-framework/dist/kui_light.css`,
        `${basePath}/ui/legacy_light_theme.css`,
      ];

      const logoutUrl = httpSetup.basePath.prepend('/api/security/logout');
      const body = renderToStaticMarkup(
        <ResetSessionPage logoutUrl={logoutUrl} styleSheetPaths={styleSheetPaths} />
      );
      return res.ok({ body });
    });

    const anonymousStatusPage = coreSetup.status.isStatusPageAnonymous();
    coreSetup.httpResources.createRegistrar(router).register(
      {
        path: '/status',
        validate: false,
        options: {
          authRequired: !anonymousStatusPage,
        },
      },
      async (context, request, response) => {
        if (anonymousStatusPage) {
          return response.renderAnonymousCoreApp();
        } else {
          return response.renderCoreApp();
        }
      }
    );
  }
  private registerStaticDirs(coreSetup: InternalCoreSetup) {
    coreSetup.http.registerStaticDir('/ui/{path*}', Path.resolve(__dirname, './assets'));

    coreSetup.http.registerStaticDir(
      '/node_modules/@kbn/ui-framework/dist/{path*}',
      fromRoot('node_modules/@kbn/ui-framework/dist')
    );
  }
}
