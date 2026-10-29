import { relative, sep } from 'node:path';
import { confirm, input, select } from '@inquirer/prompts';
import { Option, type Command } from 'commander';
import { kebab } from '../lib/case.ts';
import { ask, getContext, output, usageError, type Context } from '../lib/cli.ts';
import type { Config, Generator, Prompt } from '../lib/define.ts';
import { formatPlan } from '../lib/report.ts';
import { planData, runActions } from '../lib/run.ts';

type RunOptions = Record<string, unknown> & { dryRun?: boolean; force?: boolean };

/**
 * Register one command per generator, with a flag for each prompt. Paths in a
 * generator's actions are relative to `root`, the config file's folder.
 */
export function registerGenerators(program: Command, config: Config, root: string): void {
    for (const [name, generator] of Object.entries(config)) {
        const command = program.command(name).description(generator.description ?? `Run the ${name} generator`);
        // Commander stores each flag under its attribute name; map those back to prompt keys.
        const keys = new Map<string, string>();
        for (const [key, prompt] of Object.entries(generator.prompts)) {
            for (const option of promptOptions(key, prompt)) {
                command.addOption(option);
                keys.set(option.attributeName(), key);
            }
        }
        command
            .option('--dry-run', 'show every change, with diffs, and write nothing')
            .option('--force', 'overwrite files that already exist')
            .addHelpText('after', examples(name, generator))
            .action(async (options: RunOptions, cmd: Command) => {
                const ctx = getContext(cmd);
                const passed = new Map([...keys].map(([attribute, key]) => [key, options[attribute]]));
                const answers = await resolveAnswers(ctx, name, generator, passed);
                // Forward slashes, so it works in action paths on any OS.
                const cwd = relative(root, process.cwd()).split(sep).join('/') || '.';
                const dryRun = options.dryRun === true;
                const plan = await runActions(await generator.actions(answers, { cwd }), root, {
                    dryRun,
                    force: options.force === true,
                });
                output(ctx, { generator: name, answers, ...planData(plan, dryRun) }, formatPlan(plan, { dryRun }));
            });
    }
}

/** `--name <text>`, `--folder <choice>`, or `--story` and `--no-story`. */
function promptOptions(key: string, prompt: Prompt): Option[] {
    const flag = kebab(key);
    const description = prompt.default === undefined ? prompt.message : `${prompt.message} (default: ${prompt.default})`;
    switch (prompt.kind) {
        case 'text':
            return [new Option(`--${flag} <text>`, description)];
        case 'select':
            return [new Option(`--${flag} <choice>`, description).choices(prompt.choices)];
        case 'confirm':
            return [new Option(`--${flag}`, description), new Option(`--no-${flag}`, `answer no to "${prompt.message}"`)];
    }
}

/**
 * Take each answer from its flag. When it wasn't passed, use the prompt's
 * default if nobody can be asked, and otherwise ask.
 */
async function resolveAnswers(
    ctx: Context,
    name: string,
    generator: Generator,
    passed: ReadonlyMap<string, unknown>,
): Promise<Record<string, string | boolean>> {
    const answers: Record<string, string | boolean> = {};
    for (const [key, prompt] of Object.entries(generator.prompts)) {
        const value = passed.get(key);
        if (typeof value === 'string' && value.trim() === '') {
            throw usageError('invalid_input', `--${kebab(key)} can't be empty.`, `Pass a value, like ${flagHint(key, prompt)}.`);
        }
        if (typeof value === 'string' || typeof value === 'boolean') {
            answers[key] = value;
        } else if (!ctx.interactive && prompt.default !== undefined) {
            answers[key] = prompt.default;
        } else {
            const hint = `Pass it with ${flagHint(key, prompt)}. \`blop ${name} --help\` lists every flag.`;
            answers[key] = await ask(ctx, { name: key, hint }, () => askPrompt(prompt));
        }
    }
    return answers;
}

function askPrompt(prompt: Prompt): Promise<string | boolean> {
    switch (prompt.kind) {
        case 'text':
            return input({ message: prompt.message, default: prompt.default, required: true });
        case 'select':
            return select({ message: prompt.message, choices: prompt.choices, default: prompt.default });
        case 'confirm':
            return confirm({ message: prompt.message, default: prompt.default });
    }
}

/** How to pass a prompt's answer, for hints. */
function flagHint(key: string, prompt: Prompt): string {
    const flag = kebab(key);
    switch (prompt.kind) {
        case 'text':
            return `\`--${flag} <text>\``;
        case 'select':
            return `\`--${flag} <${prompt.choices.join('|')}>\``;
        case 'confirm':
            return `\`--${flag}\` or \`--no-${flag}\``;
    }
}

function exampleFlag(key: string, prompt: Prompt): string {
    const flag = kebab(key);
    switch (prompt.kind) {
        case 'text':
            return `--${flag} <text>`;
        case 'select':
            return `--${flag} ${prompt.choices[0]}`;
        case 'confirm':
            return `--${flag}`;
    }
}

function examples(name: string, generator: Generator): string {
    const flags = Object.entries(generator.prompts)
        .map(([key, prompt]) => exampleFlag(key, prompt))
        .join(' ');
    return `
Examples:
  $ blop ${name}          # prompts for anything you don't pass
  $ blop ${name} ${flags} --dry-run
  $ blop ${name} ${flags} --json --non-interactive`;
}
