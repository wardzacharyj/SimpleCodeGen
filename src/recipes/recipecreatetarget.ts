import { promises as fs } from 'fs';
import { window } from 'vscode';
import { CreateTarget, SymbolMap } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol } from './util';


class RecipeCreateTarget implements CreateTarget {
    name: string;
    outputFileName: string;
    outputPath: string;

    constructor(data: CreateTarget) {
        const { name, outputFileName, outputPath } = data;
        this.name = name;
        this.outputFileName = handleWorkspaceFilePathSymbol(outputFileName);
        this.outputPath = handleWorkspaceFilePathSymbol(outputPath);
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
        const filePath = `${this.outputPath}/${this.outputFileName}`;
        try {
            await fs.mkdir(this.outputPath, { recursive: true });
            await fs.writeFile(filePath, content);
        }
        catch(error) {
            window.showErrorMessage(`Create target: ${filePath}\\Write failed:\n${error}`);
            return false;
        }
        return true;
    }
}

export default RecipeCreateTarget;