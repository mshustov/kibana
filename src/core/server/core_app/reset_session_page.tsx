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
// @ts-expect-error no definitions in component folder
import { EuiButton } from '@elastic/eui/lib/components/button';
// @ts-expect-error no definitions in component folder
import { EuiPage, EuiPageBody, EuiPageContent } from '@elastic/eui/lib/components/page';
// @ts-expect-error no definitions in component folder
import { EuiEmptyPrompt } from '@elastic/eui/lib/components/empty_prompt';

import { FormattedMessage, I18nProvider } from '@kbn/i18n/react';
import { i18n } from '@kbn/i18n';

import { Fonts } from '../rendering/views/fonts';

export function ResetSessionPage({
  logoutUrl,
  styleSheetPaths,
  uiPublicUrl,
}: {
  logoutUrl: string;
  styleSheetPaths: string[];
  uiPublicUrl: string;
}) {
  return (
    <html lang={i18n.getLocale()}>
      <head>
        {styleSheetPaths.map((path) => (
          <link href={path} rel="stylesheet" key={path} />
        ))}
        <Fonts url={uiPublicUrl} />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href={`${uiPublicUrl}/favicons/apple-touch-icon.png`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href={`${uiPublicUrl}/favicons/favicon-32x32.png`}
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href={`${uiPublicUrl}/favicons/favicon-16x16.png`}
        />
        <link rel="manifest" href={`${uiPublicUrl}/favicons/manifest.json`} />
        <link
          rel="mask-icon"
          color="#e8488b"
          href={`${uiPublicUrl}/favicons/safari-pinned-tab.svg`}
        />
        <link rel="shortcut icon" href={`${uiPublicUrl}/favicons/favicon.ico`} />
        <meta name="msapplication-config" content={`${uiPublicUrl}/favicons/browserconfig.xml`} />
        <meta name="theme-color" content="#ffffff" />
      </head>
      <body>
        <I18nProvider>
          <EuiPage style={{ minHeight: '100vh' }}>
            <EuiPageBody>
              <EuiPageContent verticalPosition="center" horizontalPosition="center">
                <EuiEmptyPrompt
                  iconType="alert"
                  iconColor="danger"
                  title={
                    <h2>
                      <FormattedMessage
                        id="xpack.security.resetSession.title"
                        defaultMessage="You do not have permission to access the requested page"
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
