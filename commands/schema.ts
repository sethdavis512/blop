import type { Command, Option } from 'commander';
import { ExitCode } from '../lib/cli.ts';

type ArgumentSchema = {
    name: string;
    description: string;
    required: boolean;
    variadic: boolean;
};

type OptionSchema = {
    flags: string;
    name: string;
    description: string;
    takesValue: boolean;
    required: boolean;
    defaultValue?: unknown;
};

type CommandSchema = {
    name: string;
    description: string;
    usage: string;
    arguments: ArgumentSchema[];
    options: OptionSchema[];
    commands: CommandSchema[];
};

function describeOption(option: Option): OptionSchema {
    return {
        flags: option.flags,
        name: option.attributeName(),
        description: option.description,
        takesValue: option.required || option.optional,
        required: option.mandatory,
        ...(option.defaultValue !== undefined && { defaultValue: option.defaultValue }),
    };
}

function describeCommand(command: Command): CommandSchema {
    return {
        name: command.name(),
        description: command.description(),
        usage: command.usage(),
        arguments: command.registeredArguments.map((argument) => ({
            name: argument.name(),
            description: argument.description,
            required: argument.required,
            variadic: argument.variadic,
        })),
        options: command.options.map(describeOption),
        commands: command.commands.map(describeCommand),
    };
}

/**
 * Describe the whole CLI as JSON, built from Commander's own command tree so it
 * can never drift from the real interface. Agents read this instead of
 * scraping help text. It needs no config, auth or network.
 */
export function buildSchema(program: Command) {
    const { options, commands, ...root } = describeCommand(program);
    return {
        ...root,
        version: program.version(),
        globalOptions: options,
        commands,
        exitCodes: {
            [ExitCode.Ok]: 'success',
            [ExitCode.Error]: 'runtime error',
            [ExitCode.Usage]: 'usage error: bad or missing arguments, options or input',
        },
        output: {
            json: 'With --json, results are one line of JSON on stdout.',
            errors: 'With --json, errors are one line of JSON on stderr: {"error":{"code","message","hint"}}.',
        },
    };
}

export function registerSchema(program: Command): void {
    program
        .command('schema')
        .description('Print every command, argument and option as JSON')
        .action(() => {
            console.log(JSON.stringify(buildSchema(program), null, 2));
        });
}
