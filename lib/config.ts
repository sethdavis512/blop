import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kebab } from './case.ts';
import { CliError } from './cli.ts';
import type { Config, Generator } from './define.ts';

const CONFIG_NAMES = ['blop.config.ts', 'blop.config.js', 'blop.config.mjs'];

/** Commands blop already has, so generators can't use their names. */
export const RESERVED_COMMANDS = ['init', 'schema', 'skills', 'help'];

/** Flags every generator command already has, so prompts can't use their names. */
const RESERVED_FLAGS = ['config', 'json', 'non-interactive', 'dry-run', 'force', 'help', 'version'];

/** The nearest config file in `from` or a folder above it. */
export async function findConfig(from: string): Promise<string | null> {
    let dir = resolve(from);
    while (true) {
        for (const name of CONFIG_NAMES) {
            const path = join(dir, name);
            if (await Bun.file(path).exists()) return path;
        }
        const parent = dirname(dir);
        if (parent === dir) return null;
        dir = parent;
    }
}

export async function loadConfig(path: string): Promise<Config> {
    if (!(await Bun.file(path).exists())) {
        throw new CliError('config_not_found', `No config file at ${path}.`, {
            hint: 'Check the --config path, or run `blop init` to create blop.config.ts.',
        });
    }
    const module = await importConfig(path);
    const problems = checkConfig(module.default);
    if (problems.length > 0) {
        throw new CliError('invalid_config', `${path} isn't a valid blop config: ${problems.join('; ')}.`, {
            hint: 'Export `defineConfig({ <name>: generator({ prompts, actions }) })` as the default.',
        });
    }
    return module.default as Config;
}

async function importConfig(path: string): Promise<{ default?: unknown }> {
    try {
        return await import(pathToFileURL(path).href);
    } catch (error) {
        // The first run in a new project usually fails here, so say how to fix it.
        if (error instanceof Error && /Cannot find (package|module) 'blop'/.test(error.message)) {
            throw new CliError('blop_not_installed', `${path} imports 'blop', but it isn't installed in this project.`, {
                hint: 'Run `bun add -d blop`, or `bun link blop` to use a local checkout.',
            });
        }
        throw error;
    }
}

/** What's wrong with a config's default export, if anything. */
export function checkConfig(config: unknown): string[] {
    if (typeof config !== 'object' || config === null) return ['the default export must be defineConfig({ ... })'];
    const problems: string[] = [];
    for (const [name, value] of Object.entries(config)) {
        if (RESERVED_COMMANDS.includes(name)) problems.push(`"${name}" is a built-in command, so a generator can't use it`);
        if (!/^[a-z][\w-]*$/i.test(name)) problems.push(`"${name}" can't be a command name; use letters, digits, - and _`);
        if (!isGenerator(value)) {
            problems.push(`"${name}" needs prompts and actions; define it with generator()`);
            continue;
        }
        for (const key of Object.keys(value.prompts)) {
            const flag = kebab(key);
            if (RESERVED_FLAGS.includes(flag)) problems.push(`prompt "${key}" in "${name}" would clash with blop's --${flag} flag`);
        }
    }
    return problems;
}

function isGenerator(value: unknown): value is Generator {
    if (typeof value !== 'object' || value === null) return false;
    const { prompts, actions } = value as Partial<Record<keyof Generator, unknown>>;
    return typeof prompts === 'object' && prompts !== null && typeof actions === 'function';
}
