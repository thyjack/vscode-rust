import { ChildProcess, spawn as spawn_process } from 'child_process';
import kill = require('tree-kill');
import * as readline from 'readline';
import { Configuration } from '../configuration/Configuration';
import { ChildLogger } from '../logging/child_logger';

export type ExitCode = number;

export class Task {
    private configuration: Configuration;
    private logger: ChildLogger;
    private executable: string;
    private args: string[];
    private cwd: string;
    private onStarted?: () => void;
    private onLineReceivedInStderr?: (line: string) => void;
    private onLineReceivedInStdout?: (line: string) => void;
    private process: ChildProcess | undefined;
    private interrupted: boolean;

    public constructor(
        configuration: Configuration,
        logger: ChildLogger,
        executable: string,
        args: string[],
        cwd: string
    ) {
        this.configuration = configuration;
        this.logger = logger;
        this.executable = executable;
        this.args = args;
        this.cwd = cwd;
        this.onStarted = undefined;
        this.onLineReceivedInStderr = undefined;
        this.onLineReceivedInStdout = undefined;
        this.process = undefined;
        this.interrupted = false;
    }

    public setStarted(onStarted: () => void): void {
        this.onStarted = onStarted;
    }

    public setLineReceivedInStderr(onLineReceivedInStderr: (line: string) => void): void {
        this.onLineReceivedInStderr = onLineReceivedInStderr;
    }

    public setLineReceivedInStdout(onLineReceivedInStdout: (line: string) => void): void {
        this.onLineReceivedInStdout = onLineReceivedInStdout;
    }

    public execute(): Thenable<ExitCode> {
        return new Promise<ExitCode>((resolve, reject) => {
            let env = Object.assign({}, process.env);
            const cargoEnv = this.configuration.getCargoEnv();
            if (cargoEnv) {
                env = Object.assign(env, cargoEnv);
            }
            this.logger.debug(`execute: this.executable = "${this.executable}"`);
            this.logger.debug(`execute: this.args = ${JSON.stringify(this.args)}`);
            this.logger.debug(`execute: cargoEnv = ${JSON.stringify(cargoEnv)}`);
            if (this.onStarted) {
                this.onStarted();
            }
            const spawnedProcess: ChildProcess = spawn_process(this.executable, this.args, { cwd: this.cwd, env });
            this.process = spawnedProcess;
            if (this.onLineReceivedInStdout !== undefined) {
                const onLineReceivedInStdout = this.onLineReceivedInStdout;
                const stdout = readline.createInterface({ input: spawnedProcess.stdout });
                stdout.on('line', line => {
                    onLineReceivedInStdout(line);
                });
            }
            if (this.onLineReceivedInStderr !== undefined) {
                const onLineReceivedInStderr = this.onLineReceivedInStderr;
                const stderr = readline.createInterface({ input: spawnedProcess.stderr });
                stderr.on('line', line => {
                    onLineReceivedInStderr(line);
                });
            }
            spawnedProcess.on('error', error => {
                reject(error);
            });
            spawnedProcess.on('exit', code => {
                process.removeAllListeners();
                if (this.process === spawnedProcess) {
                    this.process = undefined;
                }
                if (this.interrupted) {
                    reject();
                    return;
                }
                resolve(code);
            });
        });
    }

    public kill(): Thenable<any> {
        return new Promise(resolve => {
            if (!this.interrupted && this.process) {
                kill(this.process.pid, 'SIGTERM', resolve);
                this.interrupted = true;
            }
        });
    }
}
