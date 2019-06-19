import { ExtendedLspServer } from './extended-lsp-server';

import { Full, FullParams, SymbolLocator } from '@elastic/lsp-extension';
import { LspClientLogger } from '@elastic/typescript-language-server/lib/logger';
import { LspClientImpl } from '@elastic/typescript-language-server/lib/lsp-client';
import * as LspConnection from '@elastic/typescript-language-server/lib/lsp-connection';
import * as lspcalls from '@elastic/typescript-language-server/lib/lsp-protocol.calls.proposed';

import { RequestHandler, RequestType } from 'vscode-jsonrpc';
import * as lsp from 'vscode-languageserver';

export namespace FullRequest {
  export const type = new RequestType<FullParams, Full, void, lsp.TextDocumentRegistrationOptions>('textDocument/full');
  export type HandlerSignature = RequestHandler<FullParams, Full | null, void>;
}

export namespace EDefinitionRequest {
  export const type = new RequestType<
    lsp.TextDocumentPositionParams,
    SymbolLocator,
    void,
    lsp.TextDocumentRegistrationOptions
    >('textDocument/edefinition');
  export type HandlerSignature = RequestHandler<lsp.TextDocumentPositionParams, Full | null, void>;
}

export function createLspConnection(options: LspConnection.IServerOptions): lsp.IConnection {
  const connection = lsp.createConnection();
  const lspClient = new LspClientImpl(connection);
  const logger = new LspClientLogger(lspClient, options.showMessageLevel);
  const server: ExtendedLspServer = new ExtendedLspServer({
    logger,
    lspClient,
    tsserverPath: options.tsserverPath,
    tsserverLogFile: options.tsserverLogFile,
    tsserverLogVerbosity: options.tsserverLogVerbosity,
    otherOptions: options.otherOptions,
  });

  connection.onInitialize(server.initialize.bind(server));

  connection.onDidOpenTextDocument(server.didOpenTextDocument.bind(server));
  connection.onDidSaveTextDocument(server.didSaveTextDocument.bind(server));
  connection.onDidCloseTextDocument(server.didCloseTextDocument.bind(server));
  connection.onDidChangeTextDocument(server.didChangeTextDocument.bind(server));

  connection.onCodeAction(server.codeAction.bind(server));
  connection.onCompletion(server.completion.bind(server));
  connection.onCompletionResolve(server.completionResolve.bind(server));
  connection.onDefinition(server.definition.bind(server));
  connection.onImplementation(server.implementation.bind(server));
  connection.onTypeDefinition(server.typeDefinition.bind(server));
  connection.onDocumentFormatting(server.documentFormatting.bind(server));
  connection.onDocumentHighlight(server.documentHighlight.bind(server));
  connection.onDocumentSymbol(server.documentSymbol.bind(server));
  connection.onExecuteCommand(server.executeCommand.bind(server));
  connection.onHover(server.hover.bind(server));
  connection.onReferences(server.references.bind(server));
  connection.onRenameRequest(server.rename.bind(server));
  connection.onSignatureHelp(server.signatureHelp.bind(server));
  connection.onWorkspaceSymbol(server.workspaceSymbol.bind(server));
  connection.onFoldingRanges(server.foldingRanges.bind(server));
  connection.onExit(server.exit.bind(server));

  // proposed `textDocument/calls` request
  connection.onRequest(lspcalls.CallsRequest.type, server.calls.bind(server));

  // Add our extension
  connection.onRequest(FullRequest.type, server.full.bind(server));
  connection.onRequest(EDefinitionRequest.type, server.edefinition.bind(server));

  return connection;
}
