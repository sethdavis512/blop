import type { Command } from 'commander';
import config from '../skills/config.md' with { type: 'text' };
import core from '../skills/core.md' with { type: 'text' };
import stub from '../skills/stub.md' with { type: 'text' };
import { getContext, output, usageError } from '../lib/cli.ts';

/**
 * Agent guides embedded in the binary at build time. Add a markdown file under
 * skills/ and an entry here when a topic needs more than `--help`.
 */
const skills = [
    { name: 'core', description: 'Operating guide: running generators, flags, output, exit codes and errors', content: core },
    { name: 'config', description: 'Writing blop.config.ts: prompts, actions and code templates', content: config },
] as const;

export function registerSkills(program: Command): void {
    const command = program
        .command('skills')
        .description('Print agent guides built into this binary')
        .addHelpText('after', `
Examples:
  $ blop skills                 # list guides
  $ blop skills get core        # print the operating guide
  $ blop skills stub > ~/.claude/skills/blop/SKILL.md`)
        .action((_options: unknown, cmd: Command) => {
            const ctx = getContext(cmd);
            const list = skills.map(({ name, description }) => ({ name, description }));
            const text = [
                ...list.map(({ name, description }) => `${name.padEnd(8)}${description}`),
                '',
                'Run `blop skills get <name>` to print one.',
            ].join('\n');
            output(ctx, { version: program.version(), skills: list }, text);
        });

    command
        .command('get')
        .description('Print one guide as markdown')
        .argument('<name>', 'guide name (see `blop skills`)')
        .action((name: string, _options: unknown, cmd: Command) => {
            const skill = skills.find((s) => s.name === name);
            if (!skill) {
                throw usageError(
                    'unknown_skill',
                    `No guide named "${name}".`,
                    `Available: ${skills.map((s) => s.name).join(', ')}.`,
                );
            }
            const ctx = getContext(cmd);
            output(ctx, { name: skill.name, content: skill.content }, skill.content.trimEnd());
        });

    command
        .command('stub')
        .description('Print a SKILL.md that points an agent at `blop skills get core`')
        .action(() => {
            process.stdout.write(stub);
        });
}
