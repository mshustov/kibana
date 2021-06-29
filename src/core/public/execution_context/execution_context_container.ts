/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */
import type { KibanaExecutionContext } from '../../types';

// Switch to the standard Baggage header
// https://github.com/elastic/apm-agent-rum-js/issues/1040
export const BAGGAGE_HEADER = 'x-kbn-context';

// Maximum number of bytes per a single name-value pair allowed by w3c spec
// https://w3c.github.io/baggage/
const BAGGAGE_MAX_PER_NAME_VALUE_PAIRS = 4096;

// a single character can use up to 4 bytes
const MAX_BAGGAGE_LENGTH = BAGGAGE_MAX_PER_NAME_VALUE_PAIRS / 4;

// the trimmed value in the server logs is better than nothing.
function enforceMaxLength(header: string): string {
  return header.slice(0, MAX_BAGGAGE_LENGTH);
}

export class ExecutionContextContainer {
  readonly #context: Readonly<KibanaExecutionContext>;
  constructor(context: Readonly<KibanaExecutionContext>) {
    this.#context = context;
  }
  toString(): string {
    return enforceMaxLength(JSON.stringify(this.#context));
  }
  toHeader() {
    return { [BAGGAGE_HEADER]: this.toString() };
  }
}
