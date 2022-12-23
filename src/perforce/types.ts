
export type P4CommandResult = {
    stdout: string | undefined,
    stderr: string | undefined
};

export type P4Workspace = {
    user: string,
    workspace: string,
    root: string,
};

export type P4PendingChangeList = {
    workspace: string,
    changeNumber: string,
    shortDescription: string,
};
