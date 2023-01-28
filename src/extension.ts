import { ExtensionContext, commands, window, workspace } from 'vscode';

import { Recipe, log } from './recipes';
import { PerforceSubscription, perforceChangeListInput, DefaultChangeList } from './perforce';

export const activate = (context: ExtensionContext) => {

    const perforceSubscription = new PerforceSubscription();
    const recipeDisposableCommand = commands.registerCommand('simple-code-gen.generate', async () => {

        // 0. Fetch workspaces and pending change lists
        const shouldUsePerforce: any = workspace.getConfiguration("simpleCodeGenerator").get("useP4Features");
        if (shouldUsePerforce) {
            await perforceSubscription.initialize();
        }

        // 1. Load Recipes
        log.appendLine("Loading Recipes...");
        const loadedRecipesConfig: any = workspace.getConfiguration("simpleCodeGenerator").get("recipes");
        const allRecipes: Recipe[] = Recipe.parse(loadedRecipesConfig);
        const selectedQuickPickItem = await Recipe.promptForInput(allRecipes);
        if (!selectedQuickPickItem) {
            return;
        }

        // 2. Collect inputs from user to build symbol map for selected recipe
        log.appendLine("Collecting inputs to build symbol map for selected recipe...");
        const { recipe } = selectedQuickPickItem;
        const { name, inputs, templates, updateTargets, createTargets } = recipe;
        const symbolMap = new Map<string, string>();
        for (let ii = 0; ii < inputs.length; ii++) {
            const recipeInput = inputs[ii];
            const uiResult = await recipeInput.promptForInput();
            if (!uiResult) {
                return;
            }
            const { symbol, value } = uiResult;
            symbolMap.set(symbol, value);
        }

        // 3. Allow user to select a change list destination
        let optionalChangeListNo: string|undefined = undefined;
        if (shouldUsePerforce) {
            const selectedChangeListNo = await perforceChangeListInput(perforceSubscription.findWorkspacePendingChangeLists());
            if (!selectedChangeListNo) {
                return;
            }
            optionalChangeListNo = (selectedChangeListNo === DefaultChangeList) ? undefined : selectedChangeListNo;
        }

        // 3. Compile template content
        log.appendLine("Compiling template content...");
        const compiledTemplates = await Promise.all(templates.map(async (template) => template.compile(symbolMap)));
        if (compiledTemplates.some((compiledTemplate) => compiledTemplate === "")) {
            window.showErrorMessage("One or more compiled templates were empty, please double check your recipe settings");
            return;
        }

        // 4. Process create targets over compiled templates
        log.appendLine("Processing template content for create target(s)...");
        for (const createTargetItem of createTargets) {
            const templateDependencies = templates.reduce<string[]>((filteredTemplates, template, index) => {
                if (template.createTargets && template.createTargets.includes(createTargetItem.name)) {
                    filteredTemplates.push(compiledTemplates[index]);
                }
                return filteredTemplates;
            }, []);

            for (const templateDependency of templateDependencies) {
                const createResult = await createTargetItem.generate(templateDependency, symbolMap, optionalChangeListNo);
                if (!createResult) {
                    window.showErrorMessage("One or more create target operations failed, aborting...");
                    return;
                }
            }
        }

        // 5. Process update target over compiled templates
        log.appendLine("Processing template content for update target(s)...");
        for (const updateTargetItem of updateTargets) {
            const templateDependencies = templates.reduce<string[]>((filteredTemplates, template, index) => {
                if (template.updateTargets && template.updateTargets.includes(updateTargetItem.name)) {
                    filteredTemplates.push(compiledTemplates[index]);
                }
                return filteredTemplates;
            }, []);

            for (const templateDependency of templateDependencies) {
                const updateResult = await updateTargetItem.generate(templateDependency, symbolMap, optionalChangeListNo);
                if (!updateResult) {
                    window.showErrorMessage("One or more update target operations failed, aborting...");
                    return;
                }
            }
        }

        window.showInformationMessage(`Completed: ${name}`);
    });

    context.subscriptions.push(perforceSubscription);
    context.subscriptions.push(recipeDisposableCommand);
};

export const deactivate = () => { };
