import { promises as fs } from 'fs';
import { window, Uri,workspace } from 'vscode';

import { InsertCriteria, InsertPosition, MatchMode, SymbolMap, UpdateTarget } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol, log } from './util';

import { PerforceSubscription } from '../perforce/';

class RecipeUpdateTarget implements UpdateTarget {    
    name: string;
    path: string;
    insertCriteria: InsertCriteria;
    private readonly p4Util: PerforceSubscription;
    private regexLineMatcher?: RegExp;
    private regexExitMatcher?: RegExp;

    constructor(data: UpdateTarget) {
        const { name, path, insertCriteria } = data;
        this.name = name;
        this.path = handleWorkspaceFilePathSymbol(path);
        this.insertCriteria = insertCriteria;
        this.p4Util = new PerforceSubscription();

        const {
            matchMode,
            insertAtLineMatching,
            stopSearchAtLineMatching
        } = this.insertCriteria;

        if (matchMode === MatchMode.useRegex) {
            this.regexLineMatcher = new RegExp(insertAtLineMatching);
            if (stopSearchAtLineMatching) {
                this.regexExitMatcher = new RegExp(stopSearchAtLineMatching);
            }
        }
    }

    private static appendLog(error: string) {
        log.appendLine(`[RecipeUpdateTarget] - ${error}`);
    }

    public static hasRequiredProperties(updateTargetCandidate: any) {
        if (!isValidObject(updateTargetCandidate)) {
            RecipeUpdateTarget.appendLog(`Encountered a malformed object`);
            return false;
        }
        const { name, path, insertCriteria } = updateTargetCandidate;
        if (!name) {
            RecipeUpdateTarget.appendLog(`Encountered a update target missing the required 'name' property`);
            return false;
        }
        if (!path) {
            RecipeUpdateTarget.appendLog(`${name} is missing the required 'path' property`);
            return false;
        }
        if (!insertCriteria) {
            RecipeUpdateTarget.appendLog(`${name} is missing the required 'insertCriteria' property`);
            return false;
        }
 
        const { position, matchMode, insertAtLineMatching } = insertCriteria;
        if (!position) {
            RecipeUpdateTarget.appendLog(`${name} is missing the required 'position' property in the 'insertCriteria' object`);
            return false;
        }
        if (!matchMode) {
            RecipeUpdateTarget.appendLog(`${name} is missing the required 'matchMode' property in the 'insertCriteria' object`);
            return false;
        }

        if (!insertAtLineMatching) {
            RecipeUpdateTarget.appendLog(`${name} is missing the required 'insertAtLineMatching' property in the 'insertCriteria' object`);
            return false;
        }

        if (position !== InsertPosition.before && position !== InsertPosition.after) {
            RecipeUpdateTarget.appendLog(`${name} 'position' property value is invalid, it must be either 'before' or 'after'`);
            return false;
        }

        if (matchMode !== MatchMode.useRegex && matchMode !== MatchMode.useString) {
            RecipeUpdateTarget.appendLog(`${name} 'matchMode' property value is invalid, it must be either 'useString' or 'useRegex'`);
            return false;
        }
        return true;
    }

    public static parse(updateTargetList: any[]): RecipeUpdateTarget[] {
        if (!updateTargetList) {
            return [];
        }
        return updateTargetList
            .filter(this.hasRequiredProperties)
            .map((filteredCandidate) => new RecipeUpdateTarget(filteredCandidate));
    }

    private shouldUseRegexMatch(): boolean {
        return this.insertCriteria.matchMode === MatchMode.useRegex;
    }

    private hasLineMatch(line: string): boolean {
        return this.shouldUseRegexMatch()
            ? this.regexLineMatcher!.test(line)
            : line.includes(this.insertCriteria.insertAtLineMatching);
    }

    private hasExitMatch(line: string): boolean {
        return this.shouldUseRegexMatch()
            ? this.regexExitMatcher!.test(line)
            : line.includes(this.insertCriteria.stopSearchAtLineMatching!);
    }

    public transformSymbols(symbolMap: SymbolMap): void {
        this.path = replaceMatchedSymbol(this.path, symbolMap);
        this.insertCriteria.insertAtLineMatching = replaceMatchedSymbol(this.insertCriteria.insertAtLineMatching, symbolMap);
        this.insertCriteria.stopSearchAtLineMatching = replaceMatchedSymbol(this.insertCriteria.stopSearchAtLineMatching, symbolMap);
    }

    public async generate(content: string, symbolMap: SymbolMap, changeList: string|undefined): Promise<boolean> {
        try {
            // Revisit if this is not a reasonable assumption in terms of the size of files this will deal with
            this.transformSymbols(symbolMap);

            const shouldUsePerforce: any = workspace.getConfiguration("simpleCodeGenerator").get("useP4Features");
            if (shouldUsePerforce) {
                const editResult = await this.p4Util.tryEdit(Uri.file(this.path), changeList);
                if (!editResult) {
                    const errorMessage = 'Failed to acquire edit permissions from p4';
                    RecipeUpdateTarget.appendLog(errorMessage);
                    throw Error(errorMessage);
                }
            }

            const rawResult = await fs.readFile(this.path);
            const stringResult = rawResult.toString();
            const normalizedSplitLines = stringResult.replace(/\r\n/g, '\n').split('\n');
            const insertIndex = this.findInsertIndex(normalizedSplitLines);
            if (insertIndex === -1) {
                const errorMessage = 'Failed to find index to insert populated template';
                RecipeUpdateTarget.appendLog(errorMessage);
                throw Error(errorMessage);
            }
            normalizedSplitLines.splice(insertIndex, 0, content);
            const contentWithInsert = normalizedSplitLines.join('\n');
            await fs.writeFile(this.path, contentWithInsert);
        }
        catch(error) {
            const errorMessage = `Recipe Update Target: ${this.path}\nWrite Failed\n${error}`;
            RecipeUpdateTarget.appendLog(errorMessage);
            window.showErrorMessage(errorMessage);
            return false;
        }
        return true;
    }

    private findInsertIndex(splitLines: string[]): number {
        let insertIndex = -1;

        for (let ii = 0; ii < splitLines.length; ii++) {
            const line = splitLines[ii];
            if (this.hasLineMatch(line)) {
                insertIndex = ii;
                if (!this.insertCriteria.stopSearchAtLineMatching) {
                    break;
                }
            }
            // If we have separate stop conditions check them
            if (this.insertCriteria.stopSearchAtLineMatching && this.hasExitMatch(line)) {
                break;
            }
        }

        return this.insertCriteria.position === InsertPosition.before
            ? insertIndex
            : insertIndex + 1;
    }
}

export default RecipeUpdateTarget;