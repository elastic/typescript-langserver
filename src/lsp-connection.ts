import { Full, FullParams } from '@elastic/lsp-extension';
import * as LspConnection from '@elastic/typescript-language-server/lib/lsp-connection';

import { RequestHandler, RequestType } from 'vscode-jsonrpc';
import * as lsp from 'vscode-languageserver';

export namespace FullRequest {
  export const type = new RequestType<FullParams, Full, void, lsp.TextDocumentRegistrationOptions>('textDocument/full');
  export type HandlerSignature = RequestHandler<FullParams, Full | null, void>;
}

export function createLspConnection(options: LspConnection.IServerOptions): lsp.IConnection {
   const connection = LspConnection.createLspConnection((options));
  // connection.onRequest(FullRequest.type, server.full.bind(server));
   return connection;
}
