import RecipeInput from './recipeinput';
import RecipeTemplate from './recipetemplate';
import RecipeUpdateTarget from './recipeupdatetarget';
import RecipeCreateTarget from './recipecreatetarget';

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
            return false;
        }

        if (!templates || templates.length === 0) {
            return false;
        }

        if (!updateTargets && !createTargets) {
            return false;
        }

        if (updateTargets
            && !createTargets
            && updateTargets.length === 0) {
            return false;
        }

        if (createTargets
            && !updateTargets
            && createTargets.length === 0) {
            return false;
        }

        if (updateTargets 
            && createTargets
            && updateTargets.length === 0
            && createTargets.length === 0) {
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
					description: `(${inputs.length} inputs)`,
					detail: `🖋  ${createText}${separtor}${updateText}`	
				};
			}),
			{
				placeHolder: 'Which recipe do you want to generate?',
				title: ":page_with_curl: Code Generator Recipe Picker",
			}
		);
    }
}

export default Recipe;