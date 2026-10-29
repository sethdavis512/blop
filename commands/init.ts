import type { Command } from 'commander';
import { add } from '../lib/actions.ts';
import { getContext, output } from '../lib/cli.ts';
import { formatPlan } from '../lib/report.ts';
import { planData, runActions } from '../lib/run.ts';
// Imported as text so compiled binaries embed it, while tsc still checks the
// starter as real code. TypeScript types it as the module, hence the cast below.
import starter from '../templates/blop.config.ts' with { type: 'text' };

export function registerInit(program: Command): void {
    program
        .command('init')
        .description('Create a starter blop.config.ts in the current folder')
        .option('--dry-run', 'show the file and write nothing')
        .option('--force', 'overwrite an existing blop.config.ts')
        .addHelpText('after', `
Examples:
  $ blop init
  $ blop init --dry-run`)
        .action(async (options: { dryRun?: boolean; force?: boolean }, command: Command) => {
            const ctx = getContext(command);
            const dryRun = options.dryRun === true;
            const actions = [add('blop.config.ts', starter as unknown as string)];
            const plan = await runActions(actions, process.cwd(), { dryRun, force: options.force === true });
            const next = dryRun ? '' : '\n\nNext: `blop component --help` shows the flags its prompts became.';
            output(ctx, planData(plan, dryRun), formatPlan(plan, { dryRun }) + next);
        });
}
