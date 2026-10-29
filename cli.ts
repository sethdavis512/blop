#!/usr/bin/env bun
import { dirname, resolve } from 'node:path';
import { select } from '@inquirer/prompts';
import { Command } from 'commander';
import { registerGenerators } from './commands/generate.ts';
import { registerInit } from './commands/init.ts';
import { registerSchema } from './commands/schema.ts';
import { registerSkills } from './commands/skills.ts';
import { argvCommand, argvConfigPath, argvWantsJson, canPrompt, CliError, reportError } from './lib/cli.ts';
import { findConfig, loadConfig, RESERVED_COMMANDS } from './lib/config.ts';
import type { Config } from './lib/define.ts';

const json = argvWantsJson();

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    // The config decides which commands exist, so load it before Commander parses.
    const configFlag = argvConfigPath(args);
    const configPath = configFlag ? resolve(configFlag) : await findConfig(process.cwd());
    const config = configPath ? await loadConfig(configPath) : null;
    const commandName = argvCommand(args);

    if (!config && commandName && !RESERVED_COMMANDS.includes(commandName)) {
        throw new CliError('config_not_found', `No blop.config.ts in ${process.cwd()} or any folder above it.`, {
            hint: 'Run `blop init` to create one, or pass --config <path>.',
        });
    }

    const program = new Command();

    // Settings here are inherited by every command registered below, so they must
    // come before the register* calls.
    program
        .name('blop')
        .description('Generate files from the typed generators in blop.config.ts')
        .version('0.1.0')
        .option('--config <path>', 'config file to use (default: the nearest blop.config.ts)')
        .option('--json', 'one line of JSON on stdout; errors as JSON on stderr')
        .option('--non-interactive', 'never prompt; fail with a usage error when input is missing')
        .addHelpText('after', rootHelp(configPath))
        .configureOutput({
            // reportError prints every error, so parse errors match the rest.
            outputError: () => {},
            // With --json, the help shown for a missing command is dropped too.
            writeErr: (str) => { if (!json) process.stderr.write(str); },
        })
        // Throw instead of calling process.exit, so reportError picks the exit code.
        .exitOverride();

    registerInit(program);
    if (config && configPath) registerGenerators(program, config, dirname(configPath));
    registerSchema(program);
    registerSkills(program);

    await program.parseAsync(config && !commandName ? await argvWithPickedGenerator(config, args) : process.argv);
}

/** With no command, a person at a terminal picks a generator instead of getting an error. */
async function argvWithPickedGenerator(config: Config, args: readonly string[]): Promise<string[]> {
    const names = Object.keys(config);
    const wantsInfo = args.some((arg) => ['-h', '--help', '-V', '--version'].includes(arg));
    if (names.length === 0 || wantsInfo || !canPrompt({ json, nonInteractive: args.includes('--non-interactive') })) {
        return process.argv;
    }
    const name = await select({
        message: 'Which generator?',
        choices: names.map((value) => ({ value, description: config[value]?.description })),
    });
    return [...process.argv.slice(0, 2), name, ...args];
}

function rootHelp(configPath: string | null): string {
    const source = configPath
        ? `Generators come from ${configPath}.`
        : 'No blop.config.ts here or in any folder above. Run `blop init` to create one.';
    return `
${source}

Examples:
  $ blop init                  # create a starter blop.config.ts
  $ blop                       # pick a generator and answer its prompts
  $ blop component --help      # each prompt is a flag
  $ blop component --name Button --dry-run

Exit codes:
  0  success
  1  runtime error
  2  usage error: bad or missing arguments, options or input

For AI agents:
  blop skills get core   operating guide (flags, output, exit codes)
  blop schema            every generator, flag and option as JSON`;
}

// No top-level await: `bun build --compile --bytecode` emits CommonJS, which doesn't support it.
main().catch((error: unknown) => {
    process.exitCode = reportError(error, json);
});
