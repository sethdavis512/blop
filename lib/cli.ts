import { CommanderError, type Command } from 'commander';
import { ExitPromptError } from '@inquirer/core';

/**
 * Exit codes are part of the CLI's contract. Agents and scripts branch on
 * them, so never print an error and exit 0.
 */
export const ExitCode = {
    Ok: 0,
    Error: 1,
    Usage: 2,
} as const;

/** Global flags registered on the root program in index.ts. */
type GlobalOptions = {
    json?: boolean;
    nonInteractive?: boolean;
};

export type Context = {
    /** Print results as one line of JSON on stdout. */
    json: boolean;
    /** Prompting is allowed: a person is at a terminal and no flag or env var forbids it. */
    interactive: boolean;
};

/**
 * Read global flags and the environment for a running command.
 * `--json` implies non-interactive, since a prompt on stdout would corrupt the JSON.
 */
export function getContext(command: Command): Context {
    const { json = false, nonInteractive = false } = command.optsWithGlobals<GlobalOptions>();
    return { json, interactive: canPrompt({ json, nonInteractive }) };
}

/** A person is at a terminal and no flag or env var forbids prompting. */
export function canPrompt({ json = false, nonInteractive = false }: GlobalOptions): boolean {
    const isTerminal = Boolean(process.stdin.isTTY && process.stdout.isTTY);
    return !json && !nonInteractive && !process.env.CI && isTerminal;
}

/**
 * True when `--json` is anywhere on the command line. Used before or after
 * Commander parses (for example, while reporting a parse error).
 */
export function argvWantsJson(argv: readonly string[] = process.argv): boolean {
    return argv.includes('--json');
}

/**
 * The value of `--config <path>` or `--config=<path>`. Read before Commander
 * parses, because the config decides which generator commands exist.
 */
export function argvConfigPath(args: readonly string[]): string | undefined {
    for (const [index, arg] of args.entries()) {
        if (arg === '--config') return args[index + 1];
        if (arg.startsWith('--config=')) return arg.slice('--config='.length);
    }
    return undefined;
}

/** The first word on the command line that isn't an option or the value of `--config`. */
export function argvCommand(args: readonly string[]): string | undefined {
    for (const [index, arg] of args.entries()) {
        if (arg.startsWith('-') || args[index - 1] === '--config') continue;
        return arg;
    }
    return undefined;
}

/**
 * An error the user or agent can act on: a stable `code` to branch on,
 * a human `message`, and a `hint` naming the next step.
 */
export class CliError extends Error {
    readonly code: string;
    readonly exitCode: number;
    readonly hint?: string;

    constructor(code: string, message: string, options: { exitCode?: number; hint?: string } = {}) {
        super(message);
        this.name = 'CliError';
        this.code = code;
        this.exitCode = options.exitCode ?? ExitCode.Error;
        this.hint = options.hint;
    }
}

/** A mistake in how the CLI was called (missing input, bad value). Exits 2. */
export function usageError(code: string, message: string, hint?: string): CliError {
    return new CliError(code, message, { exitCode: ExitCode.Usage, hint });
}

/** Print a command's result: JSON on stdout with `--json`, otherwise the text form. */
export function output(ctx: Context, data: unknown, text: string): void {
    console.log(ctx.json ? JSON.stringify(data) : text);
}

/**
 * Get input that wasn't passed as an argument or flag. Prompts when a person
 * is at a terminal; otherwise fails fast with a usage error that says how to
 * pass the value, instead of hanging on a prompt nobody can answer.
 */
export async function ask<T>(
    ctx: Context,
    missing: { name: string; hint: string },
    prompt: () => Promise<T>,
): Promise<T> {
    if (!ctx.interactive) {
        throw usageError('missing_input', `Missing required input: ${missing.name}.`, missing.hint);
    }
    return prompt();
}

/** Turn `commander.unknownOption` into `unknown_option`. */
function commanderCode(code: string): string {
    return code
        .replace(/^commander\./, '')
        .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Report any error thrown while parsing or running a command and return the
 * exit code. With `--json`, errors are one line of JSON on stderr:
 * `{"error":{"code":"...","message":"...","hint":"..."}}`.
 */
export function reportError(error: unknown, json: boolean): number {
    if (error instanceof ExitPromptError) {
        // Ctrl+C during a prompt is a deliberate exit, not a failure.
        return ExitCode.Ok;
    }

    if (error instanceof CommanderError) {
        // --help and --version also arrive here (exitCode 0) because of exitOverride().
        if (error.exitCode === 0) return ExitCode.Ok;
        // `commander.help` here means no command was given: Commander printed help to stderr.
        const noCommand = error.code === 'commander.help';
        const code = noCommand ? 'no_command' : commanderCode(error.code);
        const message = noCommand ? 'No command given.' : error.message.replace(/^error: /, '');
        if (json) {
            writeJsonError(code, message, 'Run `blop schema` to list commands, arguments and options.');
        } else {
            // Commander's own error output is silenced in index.ts, so every error looks the same.
            const hint = noCommand
                ? 'Run one of the commands above, for example `blop init` or `blop <generator>`.'
                : 'Run `blop --help` or `blop <command> --help` for usage.';
            console.error(`${noCommand ? '\n' : ''}Error [${code}]: ${message.charAt(0).toUpperCase()}${message.slice(1)}`);
            console.error(`Hint: ${hint}`);
        }
        return ExitCode.Usage;
    }

    if (error instanceof CliError) {
        if (json) {
            writeJsonError(error.code, error.message, error.hint);
        } else {
            console.error(`Error [${error.code}]: ${error.message}`);
            if (error.hint) console.error(`Hint: ${error.hint}`);
        }
        return error.exitCode;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (json) {
        writeJsonError('internal_error', message);
    } else {
        console.error(`Error [internal_error]: ${message}`);
    }
    return ExitCode.Error;
}

function writeJsonError(code: string, message: string, hint?: string): void {
    console.error(JSON.stringify({ error: { code, message, ...(hint && { hint }) } }));
}
