import { promises as fs } from 'fs';
import { window } from 'vscode';
import { SymbolMap, Template } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol, log } from './util';

class RecipeTemplate implements Template {
    readonly name: string;
    readonly symbolArguements?: string[] = [];
    singleLine?: string;
    path?: string;
    updateTargets: string[];
    createTargets: string[];
    
    constructor(content: Template){
        const { name, singleLine, path, symbolArguements, updateTargets, createTargets } = content;
        this.name = name;
        this.singleLine = handleWorkspaceFilePathSymbol(singleLine);
        this.path = handleWorkspaceFilePathSymbol(path);
        this.symbolArguements = symbolArguements;
        this.updateTargets = updateTargets;
        this.createTargets = createTargets;
    }

    private static appendLog(error: string) {
        log.appendLine(`[RecipeTemplate] - ${error}`);
    }
    
    public static hasRequiredProperties(templateCandidate: any): boolean {
        if (!isValidObject(templateCandidate)) {
            return false;
        }
        const { name, singleLine, path, symbolArguements, updateTargets, createTargets } = templateCandidate;
        if (!name) {
            RecipeTemplate.appendLog("Encountered template missing name field");
            return false;
        }
        if (path && singleLine) {
            RecipeTemplate.appendLog(`Template: ${name} contains both a populated 'path' and 'singeLine' property. Only one can be specified`);
            return false;
        }
        if (!path && !singleLine) {
            RecipeTemplate.appendLog(`Template: ${name} does not specify a 'path' or 'singeLine' property. One must be specified`);
            return false;
        }
        if (symbolArguements && !Array.isArray(symbolArguements)) {
            RecipeTemplate.appendLog(`Template: ${name} contains a 'symbolArguements' property, but it is not of type Array`);
            return false;
        }
        if (updateTargets && !Array.isArray(updateTargets)) {
            RecipeTemplate.appendLog(`Template: ${name} contains an 'updateTargets' property, but it is not of type Array`);
            return false;
        }
        if (createTargets && !Array.isArray(createTargets)) {
            RecipeTemplate.appendLog(`Template: ${name} contains an 'createTargets' property, but it is not of type Array`);
            return false;
        }
        if (updateTargets
            && createTargets
            && updateTargets.length === 0 
            && createTargets.length === 0) {
            RecipeTemplate.appendLog(`Template: ${name} contains both a 'createTargets' and 'updateTargets' property, but both are of length zero`);
            return false;
        }

        const hasNonStrings = (arrayCandidate: any[]): boolean => {
            return arrayCandidate.some((value: any) => typeof value !== 'string' || !value);
        };

        if (symbolArguements && hasNonStrings(symbolArguements)) {
            RecipeTemplate.appendLog(`Template: ${name} contains non-string values in its 'symbolArguements' array`);
            return false;
        }
        if (updateTargets && hasNonStrings(updateTargets)) {
            RecipeTemplate.appendLog(`Template: ${name} contains non-string values in its 'updateTargets' array`);
            return false;
        }
        if (createTargets && hasNonStrings(createTargets)) {
            RecipeTemplate.appendLog(`Template: ${name} contains non-string values in its 'createTargets' array`);
            return false;
        }
        return true;
    };

    public static parse(jsonTemplateList: any[]): RecipeTemplate[] {
        if (!jsonTemplateList) {
            return [];
        }
        return jsonTemplateList
            .filter(this.hasRequiredProperties)
            .map((filteredCandidate) => new RecipeTemplate(filteredCandidate));
    }

    public transformSymbols(symbolMap: SymbolMap): void {
        if (this.createTargets) {
            this.createTargets = this.createTargets.map((createTarget) => replaceMatchedSymbol(createTarget, symbolMap));
        }
        if (this.updateTargets) {
            this.updateTargets = this.updateTargets.map((updateTarget) => replaceMatchedSymbol(updateTarget, symbolMap));
        }
        this.singleLine = replaceMatchedSymbol(this.singleLine, symbolMap);
        this.path = replaceMatchedSymbol(this.path, symbolMap);
    }

    public async compile(options: SymbolMap): Promise<string> {
        try {
            this.transformSymbols(options);
            if (this.singleLine) {
                return this.singleLine;
            }
            const content = await fs.readFile(this.path!);
            const stringContent = content.toString();
            return replaceMatchedSymbol(stringContent, options, this.symbolArguements);
        }
        catch (error) {
            RecipeTemplate.appendLog(`${this.name}\nCompile Failed:\n${error}`);
            window.showErrorMessage(`Recipe Template ${this.name}\nCompile Failed:\n${error}`);
        }
        return '';
    }
}

export default RecipeTemplate;