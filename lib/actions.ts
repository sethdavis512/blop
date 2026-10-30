/**
 * Actions describe file changes; they never touch the disk themselves.
 * `createPlan` in plan.ts works out what they do, so a run can be previewed
 * with `--dry-run` and nothing is written when any action fails.
 */

export type AddAction = {
    type: 'add';
    path: string;
    content: string;
    /** What to do when the file already exists. `--force` makes every add overwrite. */
    ifExists: 'error' | 'skip' | 'overwrite';
};

export type AppendAction = {
    type: 'append';
    path: string;
    content: string;
    /** Insert on the line after the first match. Without it, the entry goes at the end. */
    after?: string | RegExp;
    /** Skip the entry when its lines are already in the file. */
    unique: boolean;
    /** Start from an empty file when it doesn't exist, instead of failing. */
    create: boolean;
};

export type ModifyAction = {
    type: 'modify';
    path: string;
    transform: (source: string) => string;
};

export type Action = AddAction | AppendAction | ModifyAction;

/** Create a file. The run fails if it already exists, unless `ifExists` or `--force` says otherwise. */
export function add(path: string, content: string, options: { ifExists?: AddAction['ifExists'] } = {}): AddAction {
    return { type: 'add', path, content, ifExists: options.ifExists ?? 'error' };
}

/** Add an entry, such as an export, to a file that exists, or that an earlier action or `create` makes. */
export function append(
    path: string,
    content: string,
    options: { after?: string | RegExp; unique?: boolean; create?: boolean } = {},
): AppendAction {
    return { type: 'append', path, content, after: options.after, unique: options.unique ?? true, create: options.create ?? false };
}

/** Rewrite a file that exists with a function of its contents. */
export function modify(path: string, transform: (source: string) => string): ModifyAction {
    return { type: 'modify', path, transform };
}
