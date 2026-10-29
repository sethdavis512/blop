import { join } from 'node:path';
import type { Action } from './actions.ts';
import { CliError } from './cli.ts';
import type { MaybeAction } from './define.ts';
import { createPlan, planPaths, type Plan } from './plan.ts';

/**
 * Plan actions against the files under `root`, then write every change, or
 * nothing when any action fails. Reading and writing live here so planning
 * itself stays pure.
 */
export async function runActions(
    actions: readonly MaybeAction[],
    root: string,
    options: { dryRun: boolean; force: boolean },
): Promise<Plan> {
    const steps = actions.filter((action): action is Action => Boolean(action));
    const files = new Map(
        await Promise.all(planPaths(steps).map(async (path) => [path, await readText(join(root, path))] as const)),
    );
    const plan = createPlan(steps, files, { force: options.force });
    if (plan.problems.length > 0) throw conflictError(plan);
    if (!options.dryRun) {
        for (const change of plan.changes) {
            if (change.status !== 'skip') await Bun.write(join(root, change.path), change.after);
        }
    }
    return plan;
}

/** The JSON form of a run. */
export function planData(plan: Plan, dryRun: boolean) {
    return {
        dryRun,
        changes: plan.changes.map(({ path, status, reason }) => ({ path, status, ...(reason && { reason }) })),
    };
}

async function readText(path: string): Promise<string | null> {
    const file = Bun.file(path);
    return (await file.exists()) ? await file.text() : null;
}

function conflictError(plan: Plan): CliError {
    const exists = plan.problems.some((problem) => problem.code === 'file_exists');
    return new CliError('conflict', `Nothing was written: ${plan.problems.map((problem) => problem.message).join('; ')}.`, {
        hint: exists
            ? 'Pass --force to overwrite files that exist, or --dry-run to preview the run.'
            : "Create the missing file or fix the generator's actions, then run it again.",
    });
}
