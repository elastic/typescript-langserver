/* tslint:disable:no-console */

// It's a copy of upstream cli.ts except this import
import { createLspConnection } from './lsp-connection';

import { getTsserverExecutable } from '@elastic/typescript-language-server/lib/utils';
import { Command } from 'commander';
import * as lsp from 'vscode-languageserver';

import * as fs from 'fs';
import * as path from 'path';

const program = new Command('typescript-language-server')
  // tslint:disable-next-line:no-var-requires
  .version(require('../package.json').version)
  .option('--stdio', 'use stdio')
  .option('--node-ipc', 'use node-ipc')
  .option(
    '--log-level <logLevel>',
    'A number indicating the log level (4 = log, 3 = info, 2 = warn, 1 = error). Defaults to `2`.')
  .option('--socket <port>', 'use socket. example: --socket=5000')
  .option(
    '--tsserver-log-file <tsserverLogFile>',
    'Specify a tsserver log file. example: --tsserver-log-file ts-logs.txt')
  .option(
    '--tsserver-log-verbosity <tsserverLogVerbosity>',
    'Specify a tsserver log verbosity (terse, normal, verbose). Defaults to `normal`.' +
    ' example: --tsserver-log-verbosity verbose')
  .option('--tsserver-path <path>', `Specify path to tsserver. example: --tsserver-path=${getTsserverExecutable()}`)
  .parse(process.argv);

if (!(program.stdio || program.socket || program.nodeIpc)) {
  console.error('Connection type required (stdio, node-ipc, socket). Refer to --help for more details.');
  process.exit(1);
}

if (program.tsserverLogFile && !program.tsserverLogVerbosity) {
  program.tsserverLogVerbosity = 'normal';
}

let logLevel = lsp.MessageType.Warning;
if (program.logLevel) {
  logLevel = parseInt(program.logLevel, 10);
  if (logLevel && (logLevel < 1 || logLevel > 4)) {
    console.error('Invalid `--log-level ' + logLevel + '`. Falling back to `info` level.');
    logLevel = lsp.MessageType.Warning;
  }
}

createLspConnection({
  tsserverPath: require.resolve('typescript/bin/tsserver'), // program.tsserverPath as string,
  tsserverLogFile: program.tsserverLogFile as string,
  tsserverLogVerbosity: program.tsserverLogVerbosity as string,
  showMessageLevel: logLevel as lsp.MessageType,
}).listen();
