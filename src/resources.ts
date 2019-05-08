/*tslint:disable:member-access*/
/*tslint:disable:max-classes-per-file*/

// import * as glob from 'fast-glob'
// import got from 'got'
// import { FORMAT_HTTP_HEADERS, Span, Tracer } from 'opentracing'

export class ResourceNotFoundError extends Error {
  public readonly name = 'ResourceNotFoundError';
  constructor(public readonly resource: URL) {
    super(`Resource not found: ${resource}`);
  }
}

/**
 * Walks through the parent directories of a given URI.
 * Starts with the directory of the start URI (or the start URI itself if it is a directory).
 * Yielded directories will always have a trailing slash.
 */
export function* walkUp(start: URL): Iterable<URL> {
  let current = new URL('.', start);
  while (true) {
    yield current;
    const parent = new URL('..', current);
    if (parent.href === current.href) {
      // Reached root
      return;
    }
    current = parent;
  }
}
