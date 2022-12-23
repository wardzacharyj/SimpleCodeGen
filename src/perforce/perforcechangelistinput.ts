import { QuickPickOptions, window } from 'vscode';
import { P4PendingChangeList } from './types';


type PerforceChangeListQuickPickInput = {
    readonly label: string;
    readonly alwaysShow: boolean;
    readonly detail: string
    readonly description: string;
    readonly changeNumberValue: string;
};

export const DefaultChangeList = 'default';

export const perforceChangeListInput = async (pendingChangeLists: P4PendingChangeList[]): Promise<string | undefined> => {
    if (pendingChangeLists.length === 0) {
        return undefined;
    }

    const quickPickOptions: QuickPickOptions = {
        title: "P4 Change List Picker",
        placeHolder: "Select change list destination",
    };
    const quickPickItems: PerforceChangeListQuickPickInput[] = pendingChangeLists.map((pendingChangeList) => {
        const { changeNumber, workspace, shortDescription } = pendingChangeList;
        const quickPickItem: PerforceChangeListQuickPickInput = {
            label: shortDescription,
            alwaysShow: false,
            detail: workspace,
            description: changeNumber,
            changeNumberValue: changeNumber,
        };
        return quickPickItem;
    });

    const defaultQuickPickItem = {
        label: 'Default Change List',
        alwaysShow: false,
        detail: quickPickItems[0].detail,
        description: '',
        changeNumberValue: DefaultChangeList
    };

    const combinedQuickPickItems = [defaultQuickPickItem, ...quickPickItems];
    const selectedChangeList = await window.showQuickPick<PerforceChangeListQuickPickInput>(combinedQuickPickItems, quickPickOptions);
    if (!selectedChangeList) {
        return undefined;
    }
    const { changeNumberValue } = selectedChangeList;
    if (!changeNumberValue) {
        return 'default';
    }

    return changeNumberValue;
}
