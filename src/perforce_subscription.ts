import { Uri, workspace, window } from 'vscode';

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

    constructor() {
        this.p4Exe = `${/^win/.test(process.platform) ? 'p4.exe' : 'p4'}`;
    }

    public dispose() {
        // required to register subscription
    }

    private async sendCommand(command: string): Promise<P4CommandResult> {
        let result: P4CommandResult = { stdout: undefined, stderr: undefined };
        try {
            result = await asyncExec(command);
        }
        catch (error) {
            window.showErrorMessage(`${error}`);
        }
        return result;
    }

    private async tryFileCommand(fileUri: Uri, command: string): Promise<boolean> {
        try {
            const wksFolder = workspace.getWorkspaceFolder(fileUri);
            if (!wksFolder) {
                throw Error("Failed to find workspace folder");
            }
            const fileCommandResult = await this.sendCommand(`${this.p4Exe} ${command} ${fileUri.fsPath}`);
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

    public async tryAdd(fileUri: Uri): Promise<boolean> {
        return this.tryFileCommand(fileUri, 'add');
    }

    public async tryEdit(fileUri: Uri): Promise<boolean> {
        return this.tryFileCommand(fileUri, 'edit');
    }
}

export default PerforceSubscription;
