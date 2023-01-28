import RecipeInput from './recipeinput';
import RecipeTemplate from './recipetemplate';
import RecipeUpdateTarget from './recipeupdatetarget';
import RecipeCreateTarget from './recipecreatetarget';

import { log } from './util';

import { window } from 'vscode';


type RecipePickerQuickPick = {
    readonly recipe: Recipe,
    readonly label: string;
    readonly alwaysShow: boolean;
    readonly detail: string
    readonly description: string;
};

type RecipeDefinition = {
    readonly name: string;
    readonly inputs: RecipeInput[];
    readonly templates: RecipeTemplate[];
    readonly updateTargets: RecipeUpdateTarget[];
    readonly createTargets: RecipeCreateTarget[];
};

class Recipe implements RecipeDefinition {
    name: string;
    inputs: RecipeInput[];
    templates: RecipeTemplate[];
    updateTargets: RecipeUpdateTarget[];
    createTargets: RecipeCreateTarget[];

    constructor(content: RecipeDefinition) {
        const { name, inputs, templates, updateTargets, createTargets } = content;
        this.name = name;
        this.inputs = inputs;
        this.templates = templates;
        this.updateTargets = updateTargets;
        this.createTargets = createTargets;
    }

    private static appendLog(error: string) {
        log.appendLine(`[Recipe] - ${error}`);
    }

    public static convert(recipeCandidate: any): Recipe {
        const { name, inputs, templates, updateTargets, createTargets } = recipeCandidate;
        const recipe: Recipe = {
            name,
            inputs: RecipeInput.parse(inputs),
            templates: RecipeTemplate.parse(templates),
            updateTargets: RecipeUpdateTarget.parse(updateTargets),
            createTargets: RecipeCreateTarget.parse(createTargets)
        };
        return recipe;
    }
    
    public static validate(recipe: Recipe): boolean {
        const { name, templates, updateTargets, createTargets } = recipe;
        if (!name) {
            Recipe.appendLog(`Encountered a recipe missing the required 'name' property`);
            return false;
        }

        if (!templates) {
            Recipe.appendLog(`Encountered a recipe missing the required 'templates' property`);
            return false;
        }

        if (templates.length === 0) {
            Recipe.appendLog(`Encountered a recipe missing at least one template object. Please make sure the recipe contains at least one template object`);
            return false;
        }

        if (!updateTargets && !createTargets) {
            Recipe.appendLog(`Encountered a recipe missing the 'updateTargets' and 'createTargets' property. At least one must be specified`);
            return false;
        }

        if (updateTargets
            && !createTargets
            && updateTargets.length === 0) {
            Recipe.appendLog(`Encountered a recipe that only specifies the 'updateTargets' property, but does not contain any update target objects. Please make sure at least one is specified`);
            return false;
        }

        if (createTargets
            && !updateTargets
            && createTargets.length === 0) {
            Recipe.appendLog(`Encountered a recipe that only specifies the 'createTargets' property, but does not contain any create target objects. Please make sure at least one is specified`);
            return false;
        }

        if (updateTargets 
            && createTargets
            && updateTargets.length === 0
            && createTargets.length === 0) {
            Recipe.appendLog(`Encountered a recipe with both the 'updateTargets' and 'createTargets' property specified, but both properties are of length zero. Please make sure at least one is specified`);
            return false;
        }
        return true;
    }

    public static parse(recipeDefinitionList: any[]): Recipe[] {
        return recipeDefinitionList.map(Recipe.convert).filter(Recipe.validate);
    }

    public static async promptForInput(recipeList: Recipe[]): Promise<RecipePickerQuickPick | undefined> {
        return await window.showQuickPick<RecipePickerQuickPick>(
			recipeList.map((recipe) => {
				const { name, inputs, updateTargets, createTargets } = recipe;
                const createText = createTargets.length > 0 ? `${createTargets.length} new` : "";
                const separtor = createTargets.length > 0 && updateTargets.length > 0 ? ", " : "";
                const updateText = updateTargets.length > 0 ? `${updateTargets.length} edit${updateTargets.length > 1 ? "s" : ""}` : "";
                return {
					recipe,
					label: name,
					alwaysShow: false,
					description: `(${inputs.length} input${inputs.length > 1 ? 's' : ''})`,
					detail: `🖋  ${createText}${separtor}${updateText}`	
				};
			}),
			{
				placeHolder: 'Which recipe do you want to generate?',
				title: "Recipe Picker",
			}
		);
    }
}

export default Recipe;