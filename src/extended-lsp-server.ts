import { DetailSymbolInformation, Full, FullParams, SymbolLocator } from '@elastic/lsp-extension';
import { shouldIncludeEntry } from '@elastic/typescript-language-server/lib/document-symbol';
import { LspServer } from '@elastic/typescript-language-server/lib/lsp-server';
import {
  asRange,
  asTagsDocumentation, pathToUri,
  toSymbolKind,
  uriToPath,
} from '@elastic/typescript-language-server/lib/protocol-translation';
import { TypeScriptInitializeParams} from '@elastic/typescript-language-server/lib/ts-protocol';
import { CommandTypes } from '@elastic/typescript-language-server/lib/tsp-command-types';
import { fs } from 'mz';
import { readFile } from 'mz/fs';
import { NullableMappedPosition, SourceMapConsumer } from 'source-map';

import * as path from 'path';
import * as tsp from 'typescript/lib/protocol';
import {fileURLToPath, pathToFileURL, URL} from 'url';
import * as lsp from 'vscode-languageserver';
import { SymbolInformation, SymbolKind } from 'vscode-languageserver';
import {
  cloneUrlFromPackageMeta,
  findClosestPackageJson, PackageJson,
  resolveDependencyRootDir,
} from './dependencies';
import { DependencyManager } from './dependency-manager';

const NODE_MODULES: string = path.sep + 'node_modules' + path.sep;
const EMPTY_FULL: Full = {symbols: [], references: []};

const TYPESCRIPT_DIR_URI = pathToFileURL(path.resolve(__dirname, '..', 'node_modules', 'typescript') + '/');
const TYPESCRIPT_VERSION = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', 'node_modules', 'typescript', 'package.json'), 'utf-8'),
).version;

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
      return {contents: []};
    }

    const result = await this.interuptDiagnostics(() => this.getQuickInfo(file, params.position));
    if (!result || !result.body) {
      return {contents: []};
    }
    const range = asRange(result.body);
    const contents: lsp.MarkedString[] = [
      {language: 'typescript', value: this.replaceWorkspaceInString(result.body.displayString)},
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

  async initialize(params: TypeScriptInitializeParams) {
    const dependencyManager = new DependencyManager(params.rootPath || uriToPath(params.rootUri!));
    if (params.initializationOptions.installNodeDependency) {
      dependencyManager.installDependency();
    }
    this.gitHostWhitelist = params.initializationOptions.gitHostWhitelist;

    const result = await super.initialize(params);

    // // @ts-ignore
    // const args: protocol.SetCompilerOptionsForInferredProjectsArgs = {
    //   options: {
    //     module: protocol.ModuleKind.CommonJS,
    //     allowNonTsExtensions: false,
    //     lib: [
    //       'esnext',
    //       'dom',
    //     ],
    //   },
    // };
    // // @ts-ignore
    // const r = await this.tspClient.request(CommandTypes.CompilerOptionsForInferredProjects, args);
    // this.logger.error(r);

    return result;
  }

  async edefinition(params: lsp.TextDocumentPositionParams): Promise<SymbolLocator> {
    this.ensureDocumentOpen(params.textDocument.uri);

    const definition = await this.definition(params);

    if (definition === null) {
      return null;
    }

    if (definition instanceof Array) {
      // TODO do we want to deal with the case more defintions are presented?
      return this.convertLocation(definition[0]);
    }
    return this.convertLocation(definition);
  }

  async full(params: FullParams): Promise<Full> {
    const uri = params.textDocument.uri;
    if (uri.endsWith('bundle.js') || uri.endsWith('.min.js')) {
      return EMPTY_FULL;
    }

    this.ensureDocumentOpen(params.textDocument.uri);
    // const req = {
    //   needFileNameList: false,
    //   file: uriToPath(uri),
    // };
    // const projectInfoResp = await this.tspClient.request(CommandTypes.ProjectInfo, req);
    // this.logger.error(projectInfoResp);

    const file = uriToPath(params.textDocument.uri);
    this.logger.log('full', params, file);
    if (!file) {
      return EMPTY_FULL;
    }

    const response = await this.tspClient.request(CommandTypes.NavTree, {
      file,
    });
    const tree = response.body;
    if (!tree || !tree.childItems) {
      return EMPTY_FULL;
    }
    // if (this.supportHierarchicalDocumentSymbol) {
    //     const symbols: lsp.DocumentSymbol[] = [];
    //     for (const item of tree.childItems) {
    //         collectDocumentSymbols(item, symbols);
    //     }
    //     return symbols;
    // }
    const symbols: lsp.SymbolInformation[] = [];
    // return EMPTY_FULL;
    // for (const item of tree.childItems) {
    //   collectSymbolInformations(params.textDocument.uri, item, symbols);
    // }
    // this.didCloseTextDocument({ textDocument: { uri: params.textDocument.uri }});

    const detailSymbols = await Promise.all(symbols.map(this.toDetailSymbolInformation));

    return {symbols: detailSymbols, references: []};
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

  exit(): void {
    process.exit();
  }

  // private cleanContainerName(name: string): string {
  //   return name.split('"').join('').split('\\').join('.').split('/').join('.');
  // }

  private async toDetailSymbolInformation(symbol: lsp.SymbolInformation): Promise<DetailSymbolInformation> {
    // TODO
    const url = new URL(symbol.location.uri);
    const [, packageJson] = await findClosestPackageJson(url, pathToFileURL(this.rootPath())); // enough param?

    const [repoUri] = getRepoUri(packageJson);
    const packageLocator = {
      name: packageJson.name,
      repoUri,
      version: '',
    };
    return {
      symbolInformation: symbol,
      qname:  getQnameBySymbolInformation(symbol),
      package: packageLocator,
    };
  }

  private ensureDocumentOpen(uri: string) {
    // TODO check if languageId does matter
    this.didOpenTextDocument({textDocument: {uri, languageId: '', text: '', version: 0}});
  }

  private replaceWorkspaceInString(str: string): string {
    const withoutRoot = str.replace(this.rootPath(), '/'); // rootPath has tailing /
    const res = withoutRoot.split(NODE_MODULES);
    return res[res.length - 1];
  }

  private async convertLocation(location: lsp.Location): Promise<SymbolLocator> {
    const url = new URL(location.uri);

    // TODO, we may not need this block, find a repo to test it
    if (url.href.startsWith(TYPESCRIPT_DIR_URI.href)) {
      const relativeFilePath = url.href.substr(url.href.indexOf(TYPESCRIPT_DIR_URI.href) - 1);

      // Can we do sourceMap?
      const typescriptUrl = `git://github.com/Microsoft/TypeScript/blob/${TYPESCRIPT_VERSION}/${relativeFilePath}`;
      return {
        location: {uri: typescriptUrl, range: location.range},
      };
    }

    if (location.uri.includes(NODE_MODULES)) {
      const moduleUrl = new URL(location.uri.substr(0, location.uri.indexOf(NODE_MODULES) + NODE_MODULES.length));
      const [, packageJson] = await findClosestPackageJson(url, moduleUrl); // enough param?
      // if (!packageJson.repository)

      const [repoUri, subdir] = getRepoUri(packageJson);

      // const npmConfig = configuration['typescript.npmrc'] || {}
      const gitVersion = 'master';

      // If there is only single package.json, maybe just use tag?
      try {
        // const packageMeta = await fetchPackageMeta(packageJson.name, packageJson.version, {});
        // if (packageMeta.gitHead) {
        //   gitVersion = packageMeta.gitHead;
        // }
      } catch (e) {
        // Keep using 'master'
      }

      let mappedUri: URL;
      let mappedRange: lsp.Range;

      try {
        const sourceMapUri = new URL(url.href + '.map');
        const sourceMapPath = fileURLToPath(sourceMapUri);
        const sourceMap = await readFile(sourceMapPath, 'utf-8');

        const consumer = await new SourceMapConsumer(sourceMap, sourceMapUri.href);
        let mappedStart: NullableMappedPosition;
        let mappedEnd: NullableMappedPosition;
        try {
          mappedStart = consumer.originalPositionFor({
            line: location.range.start.line + 1,
            column: location.range.start.character,
          });
          mappedEnd = consumer.originalPositionFor({
            line: location.range.end.line + 1,
            column: location.range.end.character,
          });
        } finally {
          consumer.destroy();
        }
        if (
          mappedStart.source === null ||
          mappedStart.line === null ||
          mappedStart.column === null ||
          mappedEnd.line === null ||
          mappedEnd.column === null
        ) {
          // Error
          mappedUri = url;

          mappedRange = {
            start: {
              line: 0,
              character: 0,
            },
            end: {
              line: 0,
              character: 0,
            },
          };
        } else {
          mappedUri = new URL(mappedStart.source);
          // if (!mappedUri.href.startsWith(tempDirUri.href)) {
          //   throw new Error(
          //     `Mapped source URI ${mappedUri} is not under root URI ${fileRootUri} and not in automatic typings`
          //   )
          // }
          mappedRange = {
            start: {
              line: mappedStart.line - 1,
              character: mappedStart.column,
            },
            end: {
              line: mappedEnd.line - 1,
              character: mappedEnd.column,
            },
          };
        }
      } catch (e) {
        mappedUri = url;
        mappedRange = location.range;
      }

      // TODO this should be simplified
      const depRootDir = resolveDependencyRootDir(fileURLToPath(url));
      const mappedPackageRelativeFilePath = path.posix.relative(depRootDir, fileURLToPath(mappedUri));
      const mappedRepoRelativeFilePath = path.posix.join(subdir, mappedPackageRelativeFilePath);

      const symbolLocation: lsp.Location = {
        uri: repoUri + '/blob/' + gitVersion + '/' + mappedRepoRelativeFilePath,
        range: mappedRange,
      };

      return {
        // TODO add qname
        location: symbolLocation,
        package: {
          name: packageJson.name,
          repoUri,
          version: gitVersion,
        },
      };
    } else {
      return {
        location,
      };
    }
  }
}

function getRepoUri(packageJson: PackageJson): [string, string] {
  let cloneUrl = cloneUrlFromPackageMeta(packageJson);
  let subdir = '';
  // Handle GitHub tree URLs
  const treeMatch = cloneUrl.match(
    /^(?:https?:\/\/)?(?:www\.)?github.com\/[^\/]+\/[^\/]+\/tree\/[^\/]+\/(.+)$/,
  );
  if (treeMatch) {
    subdir = treeMatch[1];
    cloneUrl = cloneUrl.replace(/(\/tree\/[^\/]+)\/.+/, '$1');
  }
  if (typeof packageJson.repository === 'object' && packageJson.repository.directory) {
    subdir = packageJson.repository.directory;
  } else if (packageJson.name.startsWith('@types/')) {
    // Special-case DefinitelyTyped
    subdir = packageJson.name.substr(1);
  }
  let repoUri = cloneUrl.replace('https://', 'git://');
  if (repoUri.endsWith('.git')) {
    repoUri = repoUri.substr(0, repoUri.length - 4);
  }

  return [repoUri, subdir];
}

function getQnameBySymbolInformation(info: SymbolInformation): string {
  let prefix = '';
  // if (packageLocator && packageLocator.name && packageLocator.name !== '') {
  //     prefix += packageLocator.name + '.'
  // } else {
  //     prefix = 'unknown'
  // }
  // const fileName = this.getFileName(info.location.uri);
  // const simpleName = this.getSimpleFileName(fileName)
  // if (info.location.uri !== '') {
  //     prefix += simpleName + '.'
  // }
  if (info.kind !== SymbolKind.Field) {
    if (info.containerName && info.containerName !== '') {
      prefix += info.containerName + '.';
    }
  }
  return prefix + info.name;
}

function collectSymbolInformations(
  uri: string, current: tsp.NavigationTree, symbols: lsp.SymbolInformation[], containerName?: string): boolean {
  let shouldInclude = shouldIncludeEntry(current);
  const name = current.text;
  for (const span of current.spans) {
    const range = asRange(span);
    const children: lsp.SymbolInformation[] = [];
    if (current.childItems) {
      for (const child of current.childItems) {
        // if (child.spans.some((span2) => !!Range.intersection(range, asRange(span2)))) {
        const includedChild = collectSymbolInformations(uri, child, children, name);
        shouldInclude = shouldInclude || includedChild;
        // }
      }
    }
    if (shouldInclude) {
      symbols.push({
        name,
        kind: toSymbolKind(current.kind),
        location: {
          uri,
          range,
        },
        containerName,
      });
      symbols.push(...children);
    }
    break;
  }

  return shouldInclude;
}
