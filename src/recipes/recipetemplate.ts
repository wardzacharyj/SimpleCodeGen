import { promises as fs } from 'fs';
import { window } from 'vscode';
import { SymbolMap, Template } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol } from './util';

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
    
    public static hasRequiredProperties(templateCandidate: any): boolean {
        if (!isValidObject(templateCandidate)) {
            return false;
        }
        const { name, singleLine, path, symbolArguements, updateTargets, createTargets } = templateCandidate;
        if (!name) {
            return false;
        }
        if (path && singleLine) {
            return false;
        }
        if (!path && !singleLine) {
            return false;
        }
        if (!symbolArguements || !Array.isArray(symbolArguements)) {
            return false;
        }
        if (updateTargets && !Array.isArray(updateTargets)) {
            return false;
        }
        if (createTargets && !Array.isArray(createTargets)) {
            return false;
        }
        if (updateTargets
            && createTargets
            && updateTargets.length === 0 
            && createTargets.length === 0) {
            return false;
        }

        const hasNonStrings = (arrayCandidate: any[]): boolean => {
            return arrayCandidate.some((value: any) => typeof value !== 'string' || !value);
        };

        if (hasNonStrings(symbolArguements)) {
            return false;
        }
        if (updateTargets && hasNonStrings(updateTargets)) {
            return false;
        }
        if (createTargets && hasNonStrings(createTargets)) {
            return false;
        }
        return true;
    };

    public static parse(jsonTemplateList: any[]): RecipeTemplate[] {
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
            window.showErrorMessage(`Recipe Template ${this.name}\nCompile Failed:\n${error}`);
        }
        return '';
    }
}

export default RecipeTemplate;