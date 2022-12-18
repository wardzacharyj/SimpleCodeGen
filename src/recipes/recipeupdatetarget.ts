import { promises as fs } from 'fs';
import { window, Uri,workspace } from 'vscode';

import { InsertCriteria, InsertPosition, MatchMode, SymbolMap, UpdateTarget } from './types';
import { isValidObject, handleWorkspaceFilePathSymbol, replaceMatchedSymbol } from './util';

import PerforceSubscription from '../perforce_subscription';

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

    public static hasRequiredProperties(updateTargetCandidate: any) {
        if (!isValidObject(updateTargetCandidate)) {
            return false;
        }
        const { name, path, insertCriteria } = updateTargetCandidate;
        if (!name || !path || !insertCriteria) {
            return false;
        }
        const { position, matchMode, insertAtLineMatching } = insertCriteria;
        if (!position || !matchMode || !insertAtLineMatching) {
            return false;
        }

        if (position !== InsertPosition.before && position !== InsertPosition.after) {
            return false;
        }

        if (matchMode !== MatchMode.useRegex && matchMode !== MatchMode.useString) {
            return false;
        }
        return true;
    }

    public static parse(updateTargetList: any[]): RecipeUpdateTarget[] {
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

    public async generate(content: string, symbolMap: SymbolMap): Promise<boolean> {
        try {
            // Revisit if this is not a reasonable assumption in terms of the size of files this will deal with
            this.transformSymbols(symbolMap);

            const shouldUsePerforce: any = workspace.getConfiguration("simpleCodeGenerator").get("useP4Features");
            if (shouldUsePerforce) {
                const editResult = await this.p4Util.tryEdit(Uri.file(this.path));
                if (!editResult) {
                    throw Error('Failed to acquire edit permissions from p4');
                }
            }

            const rawResult = await fs.readFile(this.path);
            const normalizedSplitLines = rawResult.toString().replaceAll(/\r\n/g, '\n').split('\n');
            const insertIndex = this.findInsertIndex(normalizedSplitLines);
            if (insertIndex === -1) {
                throw Error('Failed to find index to insert populated template');
            }
            normalizedSplitLines.splice(insertIndex, 0, content);
            const contentWithInsert = normalizedSplitLines.join('\n');
            await fs.writeFile(this.path, contentWithInsert);
        }
        catch(error) {
            window.showErrorMessage(`Recipe Update Target: ${this.path}\nWrite Failed\n${error}`);
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