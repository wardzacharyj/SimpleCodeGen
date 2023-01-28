import { promises as fs } from 'fs';
import { window, Uri, workspace } from 'vscode';
import { CreateTarget, SymbolMap } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol, log } from './util';

import { PerforceSubscription } from '../perforce';


class RecipeCreateTarget implements CreateTarget {
    name: string;
    outputFileName: string;
    outputPath: string;
    private readonly p4Util: PerforceSubscription;

    constructor(data: CreateTarget) {
        const { name, outputFileName, outputPath } = data;
        this.name = name;
        this.outputFileName = handleWorkspaceFilePathSymbol(outputFileName);
        this.outputPath = handleWorkspaceFilePathSymbol(outputPath);
        this.p4Util = new PerforceSubscription();
    }

    private static appendLog(error: string) {
        log.appendLine(`[RecipeCreateTarget] - ${error}`);
    }

    public static hasRequiredProperties(createTargetCandidate: any) {
        if (!isValidObject(createTargetCandidate)) {
            RecipeCreateTarget.appendLog(`Encountered a malformed object`);
            return false;
        }
        const { name, outputFileName, outputPath } = createTargetCandidate;
        if (!name) {
            RecipeCreateTarget.appendLog(`Encountered a create target missing the required 'name' property`);
            return false;
        }
        if (!outputFileName) {
            RecipeCreateTarget.appendLog(`Encountered a create target missing the required 'outputFileName' property`);
            return false;
        }
        if (!outputPath) {
            RecipeCreateTarget.appendLog(`Encountered a create target missing the required 'outputPath' property`);
            return false;
        }
        return true;
    }

    public static parse(createTargetList: any[]): RecipeCreateTarget[] {
        if (!createTargetList) {
            return [];
        }
        return createTargetList
            .filter(this.hasRequiredProperties)
            .map((filteredCandidate) => new RecipeCreateTarget(filteredCandidate));
    }

    public transformSymbols(symbolMap: SymbolMap): void {
        this.outputFileName = replaceMatchedSymbol(this.outputFileName, symbolMap);
        this.outputPath = replaceMatchedSymbol(this.outputPath, symbolMap);
    }

    public async generate(content: string, symbolMap: SymbolMap, changeList: string|undefined): Promise<boolean> {
        this.transformSymbols(symbolMap);
        const filePath = `${this.outputPath}${this.outputPath && this.outputPath.endsWith('/') ? '' : '/'}${this.outputFileName}`;
        try {
            await fs.mkdir(this.outputPath, { recursive: true });
            await fs.writeFile(filePath, content);

            const shouldUsePerforce: any = workspace.getConfiguration("simpleCodeGenerator").get("useP4Features");
            if (shouldUsePerforce) {
                return await this.p4Util.tryAdd(Uri.file(filePath), changeList);
            }
            return true;
        }
        catch(error) {
            const errorMessage = `Create target: ${filePath}\nWrite failed:\n${error}`;
            RecipeCreateTarget.appendLog(errorMessage);
            window.showErrorMessage(errorMessage);
            return false;
        }
        return true;
    }
}

export default RecipeCreateTarget;