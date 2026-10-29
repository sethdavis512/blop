import type { Change, Plan } from './plan.ts';

/** The text form of a plan: one line per file, plus diffs on a dry run. */
export function formatPlan(plan: Plan, options: { dryRun: boolean }): string {
    const lines: string[] = [];
    for (const change of plan.changes) {
        lines.push(`${change.status.padEnd(8)}${change.path}${change.reason ? ` (${change.reason})` : ''}`);
        if (options.dryRun && change.status !== 'skip') {
            lines.push(...diff(change).map((line) => `    ${line}`.trimEnd()));
        }
    }
    const count = plan.changes.filter((change) => change.status !== 'skip').length;
    const files = `${count} ${count === 1 ? 'file' : 'files'}`;
    lines.push('', options.dryRun ? `Dry run: ${files} would be written.` : `Wrote ${files}.`);
    return lines.join('\n');
}

/**
 * The one region that changed, with two lines of context. Appends and most
 * modifies touch one region; changes spread across a file show as one big hunk.
 */
function diff({ before, after }: Pick<Change, 'before' | 'after'>): string[] {
    const next = toLines(after);
    if (before === null) return next.map((line) => `+ ${line}`);
    const previous = toLines(before);
    let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start++;
    let endPrevious = previous.length;
    let endNext = next.length;
    while (endPrevious > start && endNext > start && previous[endPrevious - 1] === next[endNext - 1]) {
        endPrevious--;
        endNext--;
    }
    return [
        ...previous.slice(Math.max(0, start - 2), start).map((line) => `  ${line}`),
        ...previous.slice(start, endPrevious).map((line) => `- ${line}`),
        ...next.slice(start, endNext).map((line) => `+ ${line}`),
        ...previous.slice(endPrevious, endPrevious + 2).map((line) => `  ${line}`),
    ];
}

function toLines(text: string): string[] {
    return text === '' ? [] : text.replace(/\n$/, '').split('\n');
}
