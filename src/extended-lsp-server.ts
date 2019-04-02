import { DetailSymbolInformation, Full, FullParams } from '@elastic/lsp-extension';
import { collectSymbolInformations } from '@elastic/typescript-language-server/lib/document-symbol';
import { LspServer } from '@elastic/typescript-language-server/lib/lsp-server';
import { uriToPath } from '@elastic/typescript-language-server/lib/protocol-translation';
import { TypeScriptInitializeParams } from '@elastic/typescript-language-server/lib/ts-protocol';
import { CommandTypes } from '@elastic/typescript-language-server/lib/tsp-command-types';

import * as lsp from 'vscode-languageserver';

export class ExtendedLspServer extends LspServer {
  documentSymbol(params: lsp.TextDocumentPositionParams) {
    this.ensureDocumentOpen(params.textDocument.uri);
    return super.documentSymbol(params);
  }

  hover(params: lsp.TextDocumentPositionParams) {
    this.ensureDocumentOpen(params.textDocument.uri);
    // TODO: security filtering
    return super.hover(params);
  }

  references(params: lsp.TextDocumentPositionParams) {
    this.ensureDocumentOpen(params.textDocument.uri);
    // TODO: filter current project
    return super.references(params);
  }

  initialize(params: TypeScriptInitializeParams) {
    // TODO: install deps
    return super.initialize(params);
  }

  async edefinition(params: lsp.TextDocumentPositionParams): Promise<DetailSymbolInformation> {
    this.ensureDocumentOpen(params.textDocument.uri);

    // TODO
    // const loc = await this.definition(params);
    return {
      symbolInformation: {
        name: '',
        kind: lsp.SymbolKind.Class,
        location: {
          uri: '',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
        },
      },
    };
  }

  async full(params: FullParams): Promise<Full> {
    this.ensureDocumentOpen(params.textDocument.uri);

    const file = uriToPath(params.textDocument.uri);
    this.logger.log('full', params, file);
    if (!file) {
      return { symbols: [], references: [] };
    }

    const response = await this.tspClient.request(CommandTypes.NavTree, {
      file,
    });
    const tree = response.body;
    if (!tree || !tree.childItems) {
      return { symbols: [], references: [] };
    }
    // if (this.supportHierarchicalDocumentSymbol) {
    //     const symbols: lsp.DocumentSymbol[] = [];
    //     for (const item of tree.childItems) {
    //         collectDocumentSymbols(item, symbols);
    //     }
    //     return symbols;
    // }
    const symbols: lsp.SymbolInformation[] = [];
    for (const item of tree.childItems) {
      collectSymbolInformations(params.textDocument.uri, item, symbols);
    }
    this.didCloseTextDocument({ textDocument: { uri: params.textDocument.uri }});
    return { symbols: symbols.map(this.toDetailSymbolInformation), references: [] };
  }

  didOpenTextDocument(params: lsp.DidOpenTextDocumentParams): void {
    const file = uriToPath(params.textDocument.uri);
    this.logger.log('onDidOpenTextDocument', params, file);
    if (!file) {
      return;
    }
    if (this.documents.open(file, params.textDocument)) {
      this.tspClient.notify(CommandTypes.Open, {
        file,
        scriptKindName: this.getScriptKindName(params.textDocument.languageId),
        projectRootPath: this.rootPath(),
      });
    }
  }

  private toDetailSymbolInformation(symbol: lsp.SymbolInformation): DetailSymbolInformation {
    // TODO
    return {
      symbolInformation: symbol,
      qname: 'tmp',
    };
  }
  private ensureDocumentOpen(uri: string) {
    // TODO check if languageId does matter
    this.didOpenTextDocument({ textDocument: { uri, languageId: '', text: '', version: 0 }});
  }
}
