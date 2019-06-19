import {spawn} from 'child-process-promise';
import fs from 'mz/fs';
import {resolve} from 'path';
import rimraf from 'rimraf';
import { promisify } from 'util';

import { Logger } from '@elastic/typescript-language-server/lib/logger';

export class DependencyManager {
  private rimrafAysnc = promisify(rimraf);

  constructor(readonly rootPath: string, readonly logger: Logger, readonly gitHostWhitelist: string[]) { }

  async installDependency() {
    try {
      await this.runNpm();
    } catch (e) {
      // console.debug(e)
    }
  }

  async runNpm() {
    const env = Object.create(process.env);
    env.TERM = 'dumb';

    const cwd = this.rootPath;
    const yarnScript = require.resolve('yarn/bin/yarn.js');

    // if (existsSync(resolve(cwd, 'package-lock.json')) && !existsSync(resolve(cwd, 'yarn.lock'))) {
      //  TODO, use bundle npm?
      // cmd = 'npm';
    // }
    // TODO try to find package.json in lower level of directory

    this.logger.info('Running yarn to install deps..');
    if (!fs.existsSync(resolve(cwd, 'package.json'))) {
      return;
    }

    // const Spawn
    try {
      const promise = spawn(
        process.execPath,
        [
          yarnScript,
          'install',
          '--json',
          '--ignore-scripts', // no user script will be run
          '--no-progress', // don't show progress
          '--non-interactive',
          '--ignore-engines', // ignore "incompatible module" error
          '--pure-lockfile',
          '--link-duplicates',
        ],
        {
          env,
          cwd,
        },
      );

      const MAX_YARN_OUTPUT = 200;
      let totalLength = 0;
      promise.childProcess.stdout.on('data', (data) => {

        if (totalLength < MAX_YARN_OUTPUT) {
          const msg = data.toString();
          this.logger.info('[yarn]', msg);
          totalLength += msg.length;
        }
      });

      promise.childProcess.stderr.on('data', (data) => {
        if (totalLength < MAX_YARN_OUTPUT) {
          const msg = data.toString();
          this.logger.info('[yarn]', msg);
          totalLength += msg.length;
        }
      });
      await promise;
    } catch (e) {
      this.logger.error('Can\'t launch yarn to download dependencies' + e.toString());
    }

    this.logger.info('Filtering un whitelisted packages');
    await this.deletePackageRecursively(resolve(this.rootPath, 'node_modules'));
  }

  // TODO handle package softlink
  private async deletePackageRecursively(rootPath: string) {
    try {
      const names = await fs.readdir(rootPath);
      for (const name of names) {
        const childPath = resolve(rootPath, name);
        const stat = await fs.stat(childPath);
        if (stat.isDirectory()) {
          const packageFile = resolve(childPath, 'package.json');
          if (fs.existsSync(packageFile)) {
            const fileContent = await fs.readFile(packageFile, 'utf-8');
            try {
              const json = JSON.parse(fileContent);
              this.logger.log('Checking package:' + json.name);

              if (json.repository) {
                const url = new URL(json.repository.url);

                let allowed = false;
                for (const host of this.gitHostWhitelist) {
                  if (url.hostname === host || url.hostname.endsWith('.' + host)) {
                    allowed = true;
                    break;
                  }
                }

                if (!allowed) {
                  this.logger.info('Deleting package that is not whitelisted: ' + json.name + '(' + url.href + ')');
                  try {
                    await this.rimrafAysnc(childPath, {});
                    continue;
                  } catch (e) {
                    this.logger.error('Deleting repo error: ' +  e.toString());
                  }
                }
              }
            } catch (e) {
              this.logger.log('Deleting repo error: ' + e);
            }
            const nodeModulesDir = resolve(childPath, 'node_modules');
            if (fs.existsSync(nodeModulesDir)) {
              await this.deletePackageRecursively(nodeModulesDir);
            }
          } else {
            await this.deletePackageRecursively(childPath);
          }
        }
      }
    } catch (e) {
      this.logger.log(e);
    }
  }
}
