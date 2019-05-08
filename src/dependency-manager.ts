import {spawnSync} from 'child_process';
import {existsSync} from 'fs';
import {resolve} from 'path';

export class DependencyManager {
  private readonly rootPath: string;

  constructor(rootPath: string) {
    this.rootPath = rootPath;
  }

  installDependency(): void {
    try {
      this.runNpm();
    } catch (e) {
      // console.debug(e)
    }
  }

  runNpm(): void {
    const env = Object.create(process.env);
    env.TERM = 'dumb';

    const cwd = this.rootPath;
    const cmd = require.resolve('yarn/bin/yarn');

    if (existsSync(resolve(cwd, 'package-lock.json')) && !existsSync(resolve(cwd, 'yarn.lock'))) {
      //  TODO, use bundle npm?
      // cmd = 'npm';
    }

    spawnSync(
      cmd,
      [
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
        stdio: 'inherit',
      },
    );

    // this.npmProcess.stdout.on('data', data => {
    //     console.debug('stdout: ' + data)
    // })
    //
    // this.npmProcess.stderr.on('data', data => {
    //     console.debug('stderr:' + data)
    // })
    //
    // this.npmProcess.on('error', err => {
    //     console.debug('error:' + err)
    // })
  }
}
