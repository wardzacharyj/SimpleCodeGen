import { InputBoxOptions, QuickInputButton, QuickPickItem, QuickPickItemKind, QuickPickOptions, window } from 'vscode';
import { FixedInputChoice, PopulatedInputChoice, Input } from './types';
import { isValidObject } from './util';

type RecipeQuickPickInput = {
    readonly label: string;
    readonly alwaysShow: boolean;
    readonly detail: string
    readonly description: string;
    readonly fixedChoice: FixedInputChoice
};

class RecipeInput implements Input {
    title: string;
    suggestion: string;
    prompt: string;
    regexValidator?: string | undefined;
    regexErrorDescription?: string | undefined;
    fixedChoices?: FixedInputChoice[] = [];
    defaultValue?: string | undefined;
    symbol: string;
    
    constructor(content: Input){
        const { 
            title,
            suggestion,
            prompt,
            regexValidator,
            regexErrorDescription,
            fixedChoices,
            defaultValue,
            symbol
        } = content;
        this.title = title;
        this.suggestion = suggestion;
        this.prompt = prompt;
        this.regexValidator = regexValidator;
        this.regexErrorDescription = regexErrorDescription;
        this.fixedChoices = fixedChoices;
        this.defaultValue = defaultValue;
        this.symbol = symbol;
    }

    public static hasRequiredProperties(inputCandidate: any): boolean {
        if (!isValidObject(inputCandidate)) {
            return false;
        }
        const { 
            title,
            suggestion,
            prompt,
            regexValidator,
            regexErrorDescription,
            fixedChoices,
            symbol
        } = inputCandidate;
        
        // Required
        if (!title) {
            return false;
        }
        if (!suggestion) {
            return false;
        }
        if (!prompt) {
            return false;
        }
        if (!symbol) {
            return false;
        }
        const invalidRegexRequirements = (!regexValidator && regexErrorDescription)
            || (regexValidator && !regexErrorDescription);
        if (invalidRegexRequirements) {
            return false;
        }
        if (regexValidator) {
            try {
                new RegExp(regexValidator);
            } 
            catch(error) {
                return false;
            }
        }
        if (fixedChoices) {
            if (!Array.isArray(fixedChoices)) {
                return false;
            }
            for (const choice of fixedChoices) {
                const { title, description, value } = choice;
                if (!title) {
                    return false;
                } 
                if (!description) {
                    return false;
                }
                if (!value) {
                    return false;
                }
            }
        }

        return true;
    };

    public static parse(jsonInputList: any[]): RecipeInput[] {
        return jsonInputList
            .filter(RecipeInput.hasRequiredProperties)
            .map((recipeItem) => new RecipeInput(recipeItem));
    }

    private getQuickPickItems(): RecipeQuickPickInput[] {
        const vsCodeExpectedOptionFormat = this.fixedChoices!.map((fixedChoice) => {
            const { title, description } = fixedChoice;
            const quickPickItem: RecipeQuickPickInput = {
                label: title,
                alwaysShow: false,
                detail: description,
                description: "",
                fixedChoice,
            };
            return quickPickItem;
        });
        return vsCodeExpectedOptionFormat;
    }

    private getQuickPickOptions(): QuickPickOptions {
        return {
            title: this.title,
            placeHolder: this.suggestion,
        };
    }

    private getInputBoxOptions(): InputBoxOptions {
        const inputBoxOptions: InputBoxOptions = {
            title: this.title,
            prompt: this.prompt,
            placeHolder: this.suggestion,
        };
        if (this.defaultValue) {
            inputBoxOptions.value = this.defaultValue;
        }
        if (this.regexValidator && this.regexErrorDescription) {
            inputBoxOptions.validateInput = (currentInputValue: string) => {
                return currentInputValue.match(new RegExp(this.regexValidator!))
                    ? undefined
                    : this.regexErrorDescription;
            };
        }
        return inputBoxOptions;
    }
    
    public async promptForInput() {
        let result: string | undefined;
        if (this.fixedChoices && this.fixedChoices.length > 0) {
            const pickOption = await window.showQuickPick<RecipeQuickPickInput>(this.getQuickPickItems(), this.getQuickPickOptions());
            if (pickOption) {
                const { fixedChoice } = pickOption;
                const { value } = fixedChoice;
                result = value;
            }
        }
        else {
            result = await window.showInputBox(this.getInputBoxOptions());
        }

        if (!result) {
            return undefined;
        }

        const symbolEntry: PopulatedInputChoice = {
            symbol: this.symbol,
            value: result
        };

        return symbolEntry;
    };

}

export default RecipeInput;