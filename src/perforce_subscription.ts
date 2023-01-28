import { Uri, workspace, window, WorkspaceFoldersChangeEvent } from 'vscode';

import { log } from './recipes';

import { join } from 'path';
import { promises as fs } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
const asyncExec = promisify(exec);

type P4CommandResult = {
    stdout: string|undefined,
    stderr: string|undefined
};

// CLI:
// p4 [global options] command [command-specific options] [command arguments]
class PerforceSubscription {
    private readonly p4Exe: string;
    private static perforceWorkspaceMap = new Map<Uri,string>();

    constructor() {
        this.p4Exe = `${/^win/.test(process.platform) ? 'p4.exe' : 'p4'}`;
        workspace.onDidChangeWorkspaceFolders(this.onWorkspaceChanged);
    }

    private static appendLog(error: string) {
        log.appendLine(`[PerforceSubscription] ${error}`);
    }

    public dispose() {
        // required to register subscription
    }

    public async fetchWorkspaceMappings() {
        PerforceSubscription.appendLog("Fetching Workspace Mappings...");
        await this.onWorkspaceChanged({ added: workspace.workspaceFolders || [], removed: [] });
    }

    private async findP4ClientNameForWorkpace(workspaceUri: Uri): Promise<string|undefined> {
        // 1. Look for client name in config
        PerforceSubscription.appendLog(`Looking for P4 Client Name for vs workspace | ${workspaceUri.fsPath}`);
        PerforceSubscription.appendLog(`Searching for cient name in .p4config or p4 env... : `);
        for (const p4ConfigFileCandidate of [process.env.P4CONFIG, "P4CONFIG", ".p4config"]) {
            if (p4ConfigFileCandidate) {
                try {
                    const workspaceDirectory = workspaceUri.fsPath;
                    const configPath = join(workspaceDirectory, p4ConfigFileCandidate);
                    const configContents = await fs.readFile(configPath, { encoding:'utf8' });
                    const configFileLines = configContents.replaceAll(/\r\n/g, '\n').split('\n');
                    const foundP4ClientName = configFileLines.find((configLine) => {
                        const [key, value] = configLine.split("=");
                        return (key && value && key === 'P4CLIENT') ? value : undefined;
                    });
                    if (foundP4ClientName) {
                        PerforceSubscription.appendLog(`New Mapping | ${workspaceUri.fsPath} -> ${foundP4ClientName}`);
                        return foundP4ClientName;
                    }
                }
                catch (error: any) {
                    if (error && error.code !== 'ENOENT') {
                        const errorMessage = `An exception occured while trying to find the p4 client name\nError: ${error}`;
                        PerforceSubscription.appendLog(errorMessage);
                        window.showErrorMessage(errorMessage);
                    }
                }
            }
        }
        PerforceSubscription.appendLog("P4 Client name was not found in a p4 config/env variable");

        // 2. Fallback to reading the output of p4 info
        PerforceSubscription.appendLog(`Falling back to using the client name returned by "p4 info" and parsing the output`);
        const p4InfoResult = await this.tryInfo();
        const clientNameKey = 'Client name';
        if (p4InfoResult && p4InfoResult[clientNameKey]) {
            return p4InfoResult[clientNameKey];
        }

        return undefined;
    }

    private async onWorkspaceChanged(workspaceFoldersChangeEvent: WorkspaceFoldersChangeEvent) {
        const addEntryIfNew = async (uri: Uri) => {
            if (!PerforceSubscription.perforceWorkspaceMap.get(uri)) {
                const locatedClientName = await this.findP4ClientNameForWorkpace(uri);
                if (locatedClientName) {
                    PerforceSubscription.appendLog(`New Mapping | ${uri.fsPath} -> ${locatedClientName}`);
                    PerforceSubscription.perforceWorkspaceMap.set(uri, locatedClientName);
                }
            }
        };

        const { added } = workspaceFoldersChangeEvent;
        for (const workspaceFolder of added) {
            addEntryIfNew(workspaceFolder.uri);
        }

        for (const textDoc of workspace.textDocuments) {
            addEntryIfNew(textDoc.uri);
        }
    }

    private async sendCommand(command: string): Promise<P4CommandResult> {
        let result: P4CommandResult = { stdout: undefined, stderr: undefined };
        try {
            PerforceSubscription.appendLog(`Running P4 Command: ${command}`);
            result = await asyncExec(command);
        }
        catch (error) {
            PerforceSubscription.appendLog(`${error}`);
            window.showErrorMessage(`${error}`);
        }
        return result;
    }

    private async tryFileCommand(fileUri: Uri, command: string): Promise<boolean> {
        try {
            const wksFolder = workspace.getWorkspaceFolder(fileUri);
            if (!wksFolder) {
                const errorMessage = `P4 command: ${command}\nError: Failed to find workspace folder`;
                PerforceSubscription.appendLog(errorMessage);
                throw Error(errorMessage);
            }
            const p4client = PerforceSubscription.perforceWorkspaceMap.get(wksFolder.uri);
            if (!p4client) {
                const errorMessage = `P4 command: ${command}\nError: Failed to find perforce client name for the current vs workspace`;
                PerforceSubscription.appendLog(errorMessage);
                throw Error(errorMessage);
            }
            const fileCommandResult = await this.sendCommand(`${this.p4Exe} -c ${p4client} ${command} ${fileUri.fsPath}`);
            const { stderr } = fileCommandResult;
            if (stderr) {
                PerforceSubscription.appendLog(stderr);
                throw Error(stderr);
            }
            return stderr === undefined || stderr === '';
        }
        catch (error) {
            const errorMessage = `P4 Command Failed: ${command} ${fileUri.fsPath}\nReason: ${error}`;
            PerforceSubscription.appendLog(errorMessage);
            window.showErrorMessage(errorMessage);
        }
        return false;
    }

    private async tryInfo(): Promise<Record<string, string>|undefined> {
        try {
            const p4Info = await this.sendCommand(`${this.p4Exe} info`);
            const { stdout, stderr } = p4Info;
            if (stderr) {
                PerforceSubscription.appendLog(stderr);
                throw Error(stderr);
            }
            if (stdout) {
                const commandOutputLines = stdout.replaceAll(/\r\n/g, '\n').split('\n');
                if (commandOutputLines.length === 0) {
                    const errorMessage = 'P4 info command from child process failed to print to stdout';
                    PerforceSubscription.appendLog(errorMessage);
                    throw Error(errorMessage);
                }

                return commandOutputLines.reduce((outputRecord, line) => {
                    if (line) {
                        const splitLimit = 2;
                        const lineSegments = line.trim().split(': ', splitLimit);
                        if (lineSegments.length === splitLimit) {
                            const [key, value] = lineSegments;
                            if (key && value) {
                                outputRecord[key] = value.trim();
                                PerforceSubscription.appendLog(`P4 Info | ${key} = ${value}`);
                            }
                        }
                    }
                    return outputRecord;
                }, {} as Record<string, string>);
            }
        }
        catch (error) {
            const errorMessage = `P4 Subscription encountered an error:\n${error}`;
            PerforceSubscription.appendLog(errorMessage);
            throw Error(errorMessage);
        }
        return undefined;
    }

    public async tryAdd(fileUri: Uri): Promise<boolean> {
        return this.tryFileCommand(fileUri, 'add');
    }

    public async tryEdit(fileUri: Uri): Promise<boolean> {
        return this.tryFileCommand(fileUri, 'edit');
    }
}

export default PerforceSubscription;
