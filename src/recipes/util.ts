import { workspace } from "vscode";
import { SymbolMap } from "./types";

export function isValidObject(anyObject: any) {
    return anyObject && !Array.isArray(anyObject) && typeof anyObject === 'object';
}

export function handleWorkspaceFilePathSymbol(filePath: string|undefined) {
    if (!filePath) {
        return '';
    }
    if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
        const workspaceSymbol = "${workspace}";
        const workspaceFolder = workspace.workspaceFolders[0].uri.fsPath; 			
        if (workspaceFolder && filePath && filePath.includes(workspaceSymbol)) {
            return filePath.replaceAll(workspaceSymbol, workspaceFolder);
        }
    }
    return filePath;
}

export function replaceMatchedSymbol(stringValue: string|undefined, symbolMap: SymbolMap, replaceOnly: string[] = []): string {
    if (!stringValue) {
        return '';
    }
    let outputStringValue = stringValue;
    for (const [key, value] of symbolMap.entries()) {
        if (replaceOnly.length === 0 || replaceOnly.includes(key)) {
            outputStringValue = outputStringValue.replaceAll(key, value);
        }
    }
    return outputStringValue;
}