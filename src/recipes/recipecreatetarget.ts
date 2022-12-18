import { promises as fs } from 'fs';
import { window, Uri, workspace } from 'vscode';
import { CreateTarget, SymbolMap } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol } from './util';

import PerforceSubscription from '../perforce_subscription';


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

    public static hasRequiredProperties(createTargetCandidate: any) {
        if (!isValidObject(createTargetCandidate)) {
            return false;
        }
        const { name, outputFileName, outputPath } = createTargetCandidate;
        if (!name) {
            return false;
        }
        if (!outputFileName) {
            return false;
        }
        if (!outputPath) {
            return false;
        }
        return true;
    }

    public static parse(createTargetList: any[]): RecipeCreateTarget[] {
        return createTargetList
            .filter(this.hasRequiredProperties)
            .map((filteredCandidate) => new RecipeCreateTarget(filteredCandidate));
    }

    public transformSymbols(symbolMap: SymbolMap): void {
        this.outputFileName = replaceMatchedSymbol(this.outputFileName, symbolMap);
        this.outputPath = replaceMatchedSymbol(this.outputPath, symbolMap);
    }

    public async generate(content: string, symbolMap: SymbolMap): Promise<boolean> {
        this.transformSymbols(symbolMap);
        const filePath = `${this.outputPath}${this.outputPath && this.outputPath.endsWith('/') ? '' : '/'}${this.outputFileName}`;
        try {
            await fs.mkdir(this.outputPath, { recursive: true });
            await fs.writeFile(filePath, content);

            const shouldUsePerforce: any = workspace.getConfiguration("simpleCodeGenerator").get("useP4Features");
            if (shouldUsePerforce) {
                return await this.p4Util.tryAdd(Uri.file(filePath));
            }
            return true;
        }
        catch(error) {
            window.showErrorMessage(`Create target: ${filePath}\nWrite failed:\n${error}`);
            return false;
        }
        return true;
    }
}

export default RecipeCreateTarget;