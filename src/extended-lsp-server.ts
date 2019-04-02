import { DependencyManager } from './dependency-manager';

import { DetailSymbolInformation, Full, FullParams } from '@elastic/lsp-extension';
import { collectSymbolInformations } from '@elastic/typescript-language-server/lib/document-symbol';
import { LspServer } from '@elastic/typescript-language-server/lib/lsp-server';
import { asRange, asTagsDocumentation, uriToPath } from '@elastic/typescript-language-server/lib/protocol-translation';
import { TypeScriptInitializeParams } from '@elastic/typescript-language-server/lib/ts-protocol';
import { CommandTypes } from '@elastic/typescript-language-server/lib/tsp-command-types';

import * as path from 'path';
import * as lsp from 'vscode-languageserver';

const NODE_MODULES: string = 'node_modules/' + path.sep;

export class ExtendedLspServer extends LspServer {
  private gitHostWhitelist: string[] | undefined;

  documentSymbol(params: lsp.TextDocumentPositionParams) {
    this.ensureDocumentOpen(params.textDocument.uri);
    return super.documentSymbol(params);
  }

  async hover(params: lsp.TextDocumentPositionParams): Promise<lsp.Hover> {
    this.ensureDocumentOpen(params.textDocument.uri);
    const file = uriToPath(params.textDocument.uri);
    this.logger.log('hover', params, file);
    if (!file) {
      return { contents: [] };
    }

    const result = await this.interuptDiagnostics(() => this.getQuickInfo(file, params.position));
    if (!result || !result.body) {
      return { contents: [] };
    }
    const range = asRange(result.body);
    const contents: lsp.MarkedString[] = [
      { language: 'typescript', value: this.replaceWorkspaceInString(result.body.displayString) },
    ];
    // TODO: security filtering for documentation
    const tags = asTagsDocumentation(result.body.tags);
    contents.push(result.body.documentation + (tags ? '\n\n' + tags : ''));
    return {
      contents,
      range,
    };
  }

  async references(params: lsp.TextDocumentPositionParams) {
    this.ensureDocumentOpen(params.textDocument.uri);
    const rawResult = await super.references(params);
    return rawResult.filter((location) => {
      return location.uri.indexOf(NODE_MODULES) === -1;
    });
  }

  initialize(params: TypeScriptInitializeParams) {
    const dependencyManager = new DependencyManager(params.rootPath || uriToPath(params.rootUri!));
    if (params.initializationOptions.installNodeDependency) {
      dependencyManager.installDependency();
    }
    this.gitHostWhitelist = params.initializationOptions.gitHostWhitelist;

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

  private replaceWorkspaceInString(str: string): string {
    const withoutRoot = str.replace(this.rootPath(), '');
    const res = withoutRoot.split(NODE_MODULES);
    return res[res.length - 1];
  }
}
