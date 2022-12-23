import { P4CommandResult, P4PendingChangeList, P4Workspace } from './types';

import { Uri, workspace, window } from 'vscode';

import { exec } from 'child_process';
import { promisify } from 'util';

const asyncExec = promisify(exec);


// CLI:
// p4 [global options] command [command-specific options] [command arguments]
class PerforceSubscription {
    private readonly p4Exe: string;
    private static workspaceList: P4Workspace[] = [];
    private static pendingChangeLists: P4PendingChangeList[] = [];

    constructor() {
        this.p4Exe = `${/^win/.test(process.platform) ? 'p4.exe' : 'p4'}`;
    }

    public async initialize() {
        await Promise.all([this.fetchKnownWorkspaces(), this.fetchPendingChangeLists()])
    }

    public dispose() {
        // required to register subscription
    }

    private scorePathMatch(workspaceItem: P4Workspace, filePath: string): number {
        const wsRootPath = workspaceItem.root;
        if (filePath.startsWith(wsRootPath)) {
            return 1.0;
        }

        let matchScore = 0;
        const score_per_match = 1.0 / wsRootPath.length;
        for (let ii = 0; ii < wsRootPath.length; ii++) {
            if (wsRootPath.charAt(ii) === filePath.charAt(ii)) {
                matchScore += score_per_match;
            }
            else if (wsRootPath.charAt(ii).toLowerCase() !== filePath.charAt(ii).toLowerCase()) {
                return -1.0;
            }
        }
        return matchScore;
    }

    private findWorkspaceForFile(fileUri: Uri): P4Workspace | undefined {
        let bestPathScore = 0.0;
        let bestMatch: P4Workspace | undefined;

        // Find the workspace with the longest root path that includes the file path, attempt to handle case insensative FS
        // ex: windows: FOO.txt and foo.txt will be treated as equivalent files
        PerforceSubscription.workspaceList.forEach((workspaceItem) => {
            const pathScore = this.scorePathMatch(workspaceItem, fileUri.fsPath);
            if (pathScore >= bestPathScore && !bestMatch || (bestMatch && bestMatch.root.length < workspaceItem.root.length)) {
                bestMatch = workspaceItem;
                bestPathScore = pathScore;
            }
        });
        return bestMatch;
    }

    private async fetchKnownWorkspaces(): Promise<boolean> {
        try {
            const clientFetchCommand = `${this.p4Exe} clients --me`;
            const clientFetchResult = await this.sendCommand(clientFetchCommand);
            const { stdout, stderr } = clientFetchResult;
            if (stderr) {
                throw Error(stderr);
            }
            if (!stdout) {
                throw Error(`${clientFetchCommand}, failed to find workspaces for the current user`);
            }

            const normalizedLineEndings = stdout.replace(/\r\n/g, '\n');
            const commandOutputLines = normalizedLineEndings.split('\n');
            const workspaceIndex = 1;
            const workspaceRoot = 4;
            const workspaceUserIndex = 7;
            PerforceSubscription.workspaceList = commandOutputLines.reduce((resultList: P4Workspace[], lineResult: string) => {
                if (lineResult) {
                    const tokenizedLine = lineResult.split(" ");
                    if (tokenizedLine.length > 7) {
                        resultList.push({
                            workspace: tokenizedLine[workspaceIndex],
                            user: tokenizedLine[workspaceUserIndex].replace(".", ""),
                            root: tokenizedLine[workspaceRoot]
                        });
                    }
                }
                return resultList;
            }, []);
            return true;
        }
        catch (error) {
            window.showErrorMessage(`${error}`);
        }
        return false;
    }

    private async fetchPendingChangeLists(): Promise<boolean> {
        try {
            const listPendingCLCommand = `${this.p4Exe} changes --me -s pending`;
            const pendingChangeListResult = await this.sendCommand(listPendingCLCommand);
            const { stdout, stderr } = pendingChangeListResult;
            if (stderr) {
                throw Error(stderr);
            }
            if (!stdout) {
                throw Error(`${pendingChangeListResult}, failed to find pending change lists for the current user`);
            }

            const normalizedLineEndings = stdout.replace(/\r\n/g, '\n');
            const commandOutputLines = normalizedLineEndings.split('\n');
            const changeListNumberIndex = 1;
            const changeListWorkspace = 5;
            PerforceSubscription.pendingChangeLists = commandOutputLines.reduce((resultList: P4PendingChangeList[], lineResult: string) => {
                if (lineResult) {
                    const tokenizedLine = lineResult.split(" ");
                    const descriptionDelim  = "*pending* '";
                    const delimLength = descriptionDelim.length;
                    const locatedDelimIndex = lineResult.indexOf(descriptionDelim);
                    const descriptionText = `${lineResult.substring(locatedDelimIndex + delimLength, lineResult.length - 1)}...`;
                    if (tokenizedLine.length > 7) {
                        resultList.push({
                            changeNumber: tokenizedLine[changeListNumberIndex],
                            workspace: tokenizedLine[changeListWorkspace].split('@')[1],
                            shortDescription: descriptionText
                        });
                    }
                }
                return resultList;
            }, []);
            return true;
        }
        catch (error) {
            window.showErrorMessage(`${error}`);
        }
        return false;
    }

    private async sendCommand(command: string): Promise<P4CommandResult> {
        let result: P4CommandResult = { stdout: undefined, stderr: undefined };
        try {
            if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
                throw Error("Could not determine the current workspace folder");
            }
            const currentWorkingDirectory = workspace.workspaceFolders[0].uri.fsPath;
            result = await asyncExec(command, { cwd: currentWorkingDirectory });
        }
        catch (error) {
            window.showErrorMessage(`${error}`);
        }
        return result;
    }

    private async tryFileCommand(fileUri: Uri, command: string): Promise<boolean> {
        try {
            const locatedWorkspace = this.findWorkspaceForFile(fileUri)
            if (!locatedWorkspace) {
                throw Error(`Failed to determine p4 workspace ownership of file: ${fileUri.fsPath}`);
            }
            const globalArgs = `-u ${locatedWorkspace.user} -c ${locatedWorkspace.workspace}`;
            const commandString = `${this.p4Exe} ${globalArgs} ${command} ${fileUri.fsPath}`;
            const fileCommandResult = await this.sendCommand(commandString);
            const { stderr } = fileCommandResult;
            if (stderr) {
                throw Error(stderr);
            }
            return stderr === undefined || stderr === '';
        }
        catch (error) {
            window.showErrorMessage(`P4 cmd failed: ${command} ${fileUri.fsPath}\nReason: ${error}`);
        }
        return false;
    }

    public findWorkspacePendingChangeLists(): P4PendingChangeList[] {
        try {
            if (!workspace.workspaceFolders || workspace.workspaceFolders.length === 0) {
                throw Error("Could not determine the current workspace folder");
            }
            const currentWorkingDirectory = workspace.workspaceFolders[0].uri;
            const locatedWorkspace = this.findWorkspaceForFile(currentWorkingDirectory);
            if (!locatedWorkspace) {
                throw Error(`Failed to determine p4 workspace ownership of: ${currentWorkingDirectory.fsPath}`);
            }
            return PerforceSubscription.pendingChangeLists.filter((pendingChangeList) => pendingChangeList.workspace === locatedWorkspace.workspace);
        }
        catch(error) {
            window.showErrorMessage(`Failed to find workspace's pending change lists:\n${error}`);
        }

        return [];
    }

    public async tryAdd(fileUri: Uri, changeList: string|undefined): Promise<boolean> {
        return this.tryFileCommand(fileUri, `add${changeList ? ` -c ${changeList}`: ''}`);
    }

    public async tryEdit(fileUri: Uri, changeList: string|undefined): Promise<boolean> {
        return this.tryFileCommand(fileUri, `edit${changeList ? ` -c ${changeList}`: ''}`);
    }
}

export default PerforceSubscription;
