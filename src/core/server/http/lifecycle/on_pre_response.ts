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

import Boom from 'boom';
import { Lifecycle, Request, ResponseToolkit } from 'hapi';
import { KibanaRequest, KibanaResponse } from '../router';

enum ResultType {
  next = 'next',
  redirected = 'redirected',
  rejected = 'rejected',
}

interface Next {
  type: ResultType.next;
}

interface Redirected {
  type: ResultType.redirected;
  url: string;
  forward?: boolean;
}

interface Rejected {
  type: ResultType.rejected;
  error: Error;
  statusCode?: number;
}

type OnPreResponseResult = Next | Rejected | Redirected;

const preResponseResult = {
  next(): OnPreResponseResult {
    return { type: ResultType.next };
  },
  redirected(url: string): OnPreResponseResult {
    return { type: ResultType.redirected, url };
  },
  rejected(error: Error, options: { statusCode?: number } = {}): OnPreResponseResult {
    return { type: ResultType.rejected, error, statusCode: options.statusCode };
  },
  isValid(candidate: any): candidate is OnPreResponseResult {
    return (
      candidate &&
      (candidate.type === ResultType.next ||
        candidate.type === ResultType.rejected ||
        candidate.type === ResultType.redirected)
    );
  },
  isNext(result: OnPreResponseResult): result is Next {
    return result.type === ResultType.next;
  },
  isRedirected(result: OnPreResponseResult): result is Redirected {
    return result.type === ResultType.redirected;
  },
  isRejected(result: OnPreResponseResult): result is Rejected {
    return result.type === ResultType.rejected;
  },
};

/**
 * @public
 * A tool set defining an outcome of OnPreResponse interceptor for a response.
 */
export interface OnPreResponseToolkit {
  /** To pass request to the next handler */
  next: () => OnPreResponseResult;
  /* To interrupt sending response and redirect to a configured url. */
  redirected: (url: string, options?: { forward: boolean }) => OnPreResponseResult;
  /** Fail the request with specified error. */
  rejected: (error: Error, options?: { statusCode?: number }) => OnPreResponseResult;
}

const toolkit: OnPreResponseToolkit = {
  next: preResponseResult.next,
  redirected: preResponseResult.redirected,
  rejected: preResponseResult.rejected,
};

function toKibanaResponse(response: Request['response']): KibanaResponse | Error | null {
  if (!response) return null;
  if (response instanceof Error) return response;
  // TODO formalize status codes in https://github.com/elastic/kibana/issues/33779
  return new KibanaResponse(response.statusCode as any, response.source);
}

/** @public */
export type OnPreResponseHandler<Params = any, Query = any, Body = any, TResponse = any> = (
  request: KibanaRequest<Params, Query, Body>,
  response: KibanaResponse | Error | null,
  t: OnPreResponseToolkit
) => OnPreResponseResult | Promise<OnPreResponseResult>;

/**
 * @public
 * Adopt custom response interceptor to Hapi lifecycle system.
 * @param fn - an extension point allowing to perform custom logic for
 * outgoing HTTP response.
 *
 * Doesn't allow to change response body & headers.
 * Functionality will be added later.
 */
export function adoptToHapiOnPreResponseFormat(fn: OnPreResponseHandler) {
  return async function interceptPreAuthRequest(
    request: Request,
    h: ResponseToolkit
  ): Promise<Lifecycle.ReturnValue> {
    try {
      const result = await fn(
        KibanaRequest.from(request, undefined),
        toKibanaResponse(request.response),
        toolkit
      );

      if (preResponseResult.isValid(result)) {
        if (preResponseResult.isNext(result)) {
          return h.continue;
        }

        if (preResponseResult.isRedirected(result)) {
          const { url } = result;
          return h.redirect(url).takeover();
        }

        if (preResponseResult.isRejected(result)) {
          const { error, statusCode } = result;
          return Boom.boomify(error, { statusCode });
        }
      }

      throw new Error(
        `Unexpected result from OnPreResponse. Expected OnPreResponseResult, but given: ${result}.`
      );
    } catch (error) {
      return Boom.internal(error.message, { statusCode: 500 });
    }
  };
}
