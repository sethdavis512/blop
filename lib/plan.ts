import { normalize } from 'node:path';
import type { Action } from './actions.ts';

export type Change = {
    path: string;
    status: 'create' | 'update' | 'skip';
    /** Contents before the run; null when the file doesn't exist yet. */
    before: string | null;
    /** Contents after the run. */
    after: string;
    /** Why a file is skipped. */
    reason?: string;
};

export type Problem = {
    path: string;
    code: 'file_exists' | 'file_missing' | 'no_match';
    message: string;
};

export type Plan = { changes: Change[]; problems: Problem[] };

/** Every file the actions touch, so the caller can read them all before planning. */
export function planPaths(actions: readonly Action[]): string[] {
    return [...new Set(actions.map((action) => normalize(action.path)))];
}

/**
 * Work out every file change a list of actions makes, without touching the disk.
 * `files` maps each path from `planPaths` to its contents, or null when it doesn't
 * exist. Each action sees the changes before it, so a run can create a file and
 * append to it. When `problems` isn't empty, the caller should write nothing.
 */
export function createPlan(
    actions: readonly Action[],
    files: ReadonlyMap<string, string | null>,
    options: { force?: boolean } = {},
): Plan {
    const current = new Map(files);
    const written: string[] = [];
    const skipped = new Map<string, string>();
    const problems: Problem[] = [];

    for (const action of actions) {
        const path = normalize(action.path);
        if (!current.has(path)) throw new Error(`createPlan: ${path} wasn't loaded. Read every path from planPaths() first.`);
        const outcome = applyAction(action, path, current.get(path) ?? null, options.force === true);
        if ('problem' in outcome) {
            problems.push({ path, ...outcome.problem });
        } else if ('skip' in outcome) {
            if (!skipped.has(path)) skipped.set(path, outcome.skip);
        } else {
            if (!written.includes(path)) written.push(path);
            current.set(path, outcome.text);
        }
    }

    const changes = written.map((path): Change => {
        const before = files.get(path) ?? null;
        const after = current.get(path) ?? '';
        if (before === after) return { path, status: 'skip', before, after, reason: 'unchanged' };
        return { path, status: before === null ? 'create' : 'update', before, after };
    });
    for (const [path, reason] of skipped) {
        // A later action changed the file, so it isn't skipped after all.
        if (written.includes(path)) continue;
        const before = files.get(path) ?? null;
        changes.push({ path, status: 'skip', before, after: before ?? '', reason });
    }
    return { changes, problems };
}

type Outcome = { text: string } | { skip: string } | { problem: Omit<Problem, 'path'> };

/** What one action does to one file's contents. */
function applyAction(action: Action, path: string, existing: string | null, force: boolean): Outcome {
    if (action.type === 'add') {
        // --force only overrides the default; an explicit `ifExists: 'skip'` still skips.
        const ifExists = force && action.ifExists === 'error' ? 'overwrite' : action.ifExists;
        if (existing === null || ifExists === 'overwrite') return { text: action.content };
        if (ifExists === 'skip') return { skip: 'already exists' };
        return { problem: { code: 'file_exists', message: `${path} already exists` } };
    }
    if (existing === null) {
        return { problem: { code: 'file_missing', message: `${path} doesn't exist, so there's nothing to ${action.type}` } };
    }
    if (action.type === 'modify') return { text: action.transform(existing) };
    if (action.unique && containsLines(existing, action.content)) return { skip: 'entry already present' };
    const text = insertEntry(existing, action.content, action.after);
    if (text === null) return { problem: { code: 'no_match', message: `${path} has no match for ${String(action.after)}` } };
    return { text };
}

/** True when the entry's lines already appear together in the text, ignoring indentation. */
function containsLines(text: string, entry: string): boolean {
    const flatten = (value: string) => value.trim().split('\n').map((line) => line.trim()).join('\n');
    return `\n${flatten(text)}\n`.includes(`\n${flatten(entry)}\n`);
}

/** Put the entry on its own line after the line that matches `after`, or at the end. Null when nothing matches. */
function insertEntry(text: string, entry: string, after: string | RegExp | undefined): string | null {
    const line = `${entry.replace(/\n$/, '')}\n`;
    if (after === undefined) return text === '' || text.endsWith('\n') ? text + line : `${text}\n${line}`;
    const end = matchEnd(text, after);
    if (end === null) return null;
    const lineEnd = text.indexOf('\n', Math.max(0, end - 1));
    if (lineEnd === -1) return `${text}\n${line}`;
    return text.slice(0, lineEnd + 1) + line + text.slice(lineEnd + 1);
}

/** The index just past the first match, or null. Copying the regex keeps a `g` flag's lastIndex out of it. */
function matchEnd(text: string, pattern: string | RegExp): number | null {
    if (typeof pattern === 'string') {
        const start = text.indexOf(pattern);
        return start === -1 ? null : start + pattern.length;
    }
    const match = new RegExp(pattern.source, pattern.flags.replace(/[gy]/g, '')).exec(text);
    return match ? match.index + match[0].length : null;
}
