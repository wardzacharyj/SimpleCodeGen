export type FixedInputChoice = {
    readonly title: string;
    readonly description: string;
    readonly value: string;
};

export type PopulatedInputChoice = {
    readonly symbol: string;
    readonly value: string;
};

export type PromptForInput = () => Promise<PopulatedInputChoice | undefined>;
export type Input = {
    readonly title: string;
    readonly suggestion: string;
    readonly prompt: string;
    readonly regexValidator?: string;
    readonly regexErrorDescription?: string;
    readonly fixedChoices?: FixedInputChoice[];
    readonly defaultValue?: string;
    readonly symbol: string;

    promptForInput: PromptForInput;
};

export type SymbolMap = Map<string, string>;

export type Template = {
    readonly name: string;
    readonly singleLine?: string;
    readonly path?: string;
    readonly symbolArguements?: string[];
    readonly updateTargets: string[];
    readonly createTargets: string[];

    transformSymbols: (symbolMap: SymbolMap) => void;
    compile: (symbolMap: SymbolMap) => Promise<string>;
};

export enum InsertPosition { before = 'before', after = 'after' };
export enum MatchMode { useRegex = 'useRegex', useString = 'useString' }
export type InsertPositionType = InsertPosition.before | InsertPosition.after;
export type MatchModeType = MatchMode.useRegex | MatchMode.useString;
export type InsertCriteria = {
    readonly position: InsertPosition;
    readonly matchMode: MatchModeType;
    insertAtLineMatching: string;
    stopSearchAtLineMatching?: string;
};

export type UpdateTarget = {
    readonly name: string;
    path: string;
    insertCriteria: InsertCriteria;

    transformSymbols: (symbolMap: SymbolMap) => void;
    generate: (content: string, symbolMap: SymbolMap) => Promise<boolean>;
};

export type CreateTarget = {
    readonly name: string;
    outputFileName: string;
    outputPath: string;

    transformSymbols: (symbolMap: SymbolMap) => void;
    generate: (content: string, symbolMap: SymbolMap) => Promise<boolean>;
};