import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Integration tests: run the real CLI the way an agent does, with no terminal
 * attached (so prompting is off), in a throwaway project where `blop` is
 * linked into node_modules like `bun link blop` would.
 */
let project: string;

beforeEach(async () => {
    project = await mkdtemp(join(tmpdir(), 'blop-test-'));
    await mkdir(join(project, 'node_modules'));
    await symlink(import.meta.dir, join(project, 'node_modules', 'blop'));
});

afterEach(async () => {
    await rm(project, { recursive: true, force: true });
});

async function runIn(cwd: string, ...args: string[]) {
    const proc = Bun.spawn(['bun', 'run', `${import.meta.dir}/cli.ts`, ...args], {
        cwd,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, CI: '' },
    });
    const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
    ]);
    return { stdout, stderr, exitCode };
}

const run = (...args: string[]) => runIn(project, ...args);
const read = (path: string) => Bun.file(join(project, path)).text();
const exists = (path: string) => Bun.file(join(project, path)).exists();
const write = (path: string, content: string) => Bun.write(join(project, path), content);

describe('init', () => {
    it('writes the starter config', async () => {
        const { stdout, exitCode } = await run('init');
        expect(exitCode).toBe(0);
        expect(stdout).toStartWith('create  blop.config.ts\n');
        expect(await read('blop.config.ts')).toBe(await Bun.file(`${import.meta.dir}/templates/blop.config.ts`).text());
    });

    it('previews with --dry-run and writes nothing', async () => {
        const { stdout, exitCode } = await run('init', '--dry-run');
        expect(exitCode).toBe(0);
        expect(stdout).toContain('Dry run: 1 file would be written.');
        expect(await exists('blop.config.ts')).toBe(false);
    });

    it("won't overwrite an existing config", async () => {
        await run('init');
        const { stdout, stderr, exitCode } = await run('init');
        expect(exitCode).toBe(1);
        expect(stdout).toBe('');
        expect(stderr).toContain('Error [conflict]: Nothing was written: blop.config.ts already exists.');
        expect(stderr).toContain('Hint: Pass --force');
    });
});

describe('generators', () => {
    beforeEach(async () => {
        await run('init');
    });

    it('writes every file from flags and prints the run as JSON', async () => {
        const { stdout, exitCode } = await run('component', '--name', 'fancy button', '--no-story', '--json');
        expect(exitCode).toBe(0);
        expect(JSON.parse(stdout)).toEqual({
            generator: 'component',
            answers: { name: 'fancy button', folder: 'components', story: false },
            dryRun: false,
            changes: [
                { path: 'src/components/FancyButton/FancyButton.tsx', status: 'create' },
                { path: 'src/components/FancyButton/index.ts', status: 'create' },
                { path: 'src/index.ts', status: 'create' },
            ],
        });
        expect(await read('src/components/FancyButton/FancyButton.tsx')).toBe(
            [
                "import type { ComponentPropsWithoutRef } from 'react';",
                '',
                "type FancyButtonProps = ComponentPropsWithoutRef<'div'>;",
                '',
                'export function FancyButton({ className, ...props }: FancyButtonProps) {',
                '    return <div className={className} {...props} />;',
                '}',
                '',
            ].join('\n'),
        );
        expect(await read('src/index.ts')).toBe("export * from './components/FancyButton';\n");
        expect(await exists('src/components/FancyButton/FancyButton.stories.tsx')).toBe(false);
    });

    it("uses each prompt's default when it can't ask", async () => {
        const { exitCode } = await run('component', '--name', 'Card');
        expect(exitCode).toBe(0);
        expect(await exists('src/components/Card/Card.stories.tsx')).toBe(true);
    });

    it('adds to an existing barrel file', async () => {
        await write('src/index.ts', "export * from './legacy';\n");
        await run('component', '--name', 'Card', '--folder', 'ui');
        expect(await read('src/index.ts')).toBe("export * from './legacy';\nexport * from './ui/Card';\n");
    });

    it('previews with diffs on --dry-run and writes nothing', async () => {
        await write('src/index.ts', "export * from './legacy';\n");
        const { stdout, exitCode } = await run('component', '--name', 'Card', '--dry-run');
        expect(exitCode).toBe(0);
        expect(stdout).toContain('create  src/components/Card/Card.tsx\n    + import type');
        expect(stdout).toContain("update  src/index.ts\n      export * from './legacy';\n    + export * from './components/Card';");
        expect(stdout).toEndWith('Dry run: 4 files would be written.\n');
        expect(await exists('src/components/Card')).toBe(false);
    });

    it('writes nothing when any action fails', async () => {
        await run('component', '--name', 'Card');
        await rm(join(project, 'src/components/Card/index.ts'));
        const { stderr, exitCode } = await run('component', '--name', 'Card', '--json');
        expect(exitCode).toBe(1);
        expect(JSON.parse(stderr)).toMatchObject({ error: { code: 'conflict' } });
        expect(await exists('src/components/Card/index.ts')).toBe(false);
    });

    it('overwrites with --force without duplicating the barrel entry', async () => {
        await run('component', '--name', 'Card');
        await write('src/components/Card/Card.tsx', 'edited\n');
        const { exitCode } = await run('component', '--name', 'Card', '--force');
        expect(exitCode).toBe(0);
        expect(await read('src/components/Card/Card.tsx')).toStartWith('import type');
        expect(await read('src/index.ts')).toBe("export * from './components/Card';\n");
    });

    it('writes relative to the config file when run from a subfolder', async () => {
        await mkdir(join(project, 'src/deep'), { recursive: true });
        const { exitCode } = await runIn(join(project, 'src/deep'), 'component', '--name', 'Card', '--no-story');
        expect(exitCode).toBe(0);
        expect(await exists('src/components/Card/Card.tsx')).toBe(true);
    });

    it('fails fast with a usage error instead of prompting without a terminal', async () => {
        const { stdout, stderr, exitCode } = await run('component', '--json');
        expect(exitCode).toBe(2);
        expect(stdout).toBe('');
        expect(JSON.parse(stderr)).toEqual({
            error: {
                code: 'missing_input',
                message: 'Missing required input: name.',
                hint: 'Pass it with `--name <text>`. `blop component --help` lists every flag.',
            },
        });
    });

    it('rejects an empty text answer and a choice that is not listed', async () => {
        const empty = await run('component', '--name', ' ');
        expect(empty.exitCode).toBe(2);
        expect(empty.stderr).toContain('Error [invalid_input]');
        const choice = await run('component', '--name', 'Card', '--folder', 'nope');
        expect(choice.exitCode).toBe(2);
        expect(choice.stderr).toContain('Error [invalid_argument]');
    });
});

describe('config', () => {
    it('says how to start when there is no config', async () => {
        const { stderr, exitCode } = await run('component');
        expect(exitCode).toBe(1);
        expect(stderr).toContain('Error [config_not_found]');
        expect(stderr).toContain('Hint: Run `blop init`');
    });

    it('rejects a config that is not a set of generators', async () => {
        await write('blop.config.ts', 'export default { init: {}, card: { prompts: { force: {} }, actions() { return []; } } };\n');
        const { stderr, exitCode } = await run('card', '--json');
        expect(exitCode).toBe(1);
        const { error } = JSON.parse(stderr);
        expect(error.code).toBe('invalid_config');
        expect(error.message).toContain('"init" is a built-in command');
        expect(error.message).toContain('would clash with blop\'s --force flag');
    });

    it("says how to install blop when the config can't import it", async () => {
        await run('init');
        await rm(join(project, 'node_modules'), { recursive: true });
        const { stderr, exitCode } = await run('component', '--name', 'Card');
        expect(exitCode).toBe(1);
        expect(stderr).toContain('Error [blop_not_installed]');
    });

    it('loads the config passed with --config', async () => {
        await run('init');
        await mkdir(join(project, 'tools'));
        await Bun.write(join(project, 'tools/blop.config.ts'), Bun.file(join(project, 'blop.config.ts')));
        await rm(join(project, 'blop.config.ts'));
        const { exitCode } = await run('--config', 'tools/blop.config.ts', 'component', '--name', 'Card');
        expect(exitCode).toBe(0);
        expect(await exists('tools/src/components/Card/Card.tsx')).toBe(true);
    });
});

describe('action context', () => {
    // A generator that writes a note where it was run, containing that folder.
    const noteConfig = [
        "import { add, defineConfig, generator } from 'blop';",
        '',
        'export default defineConfig({',
        '    note: generator({',
        '        prompts: {},',
        '        actions: (_answers, { cwd }) => [add(`${cwd}/note.txt`, `${cwd}\\n`)],',
        '    }),',
        '});',
    ].join('\n');

    it('tells actions which folder blop ran in, relative to the config', async () => {
        await write('blop.config.ts', noteConfig);
        await mkdir(join(project, 'src/features/billing'), { recursive: true });
        expect((await runIn(join(project, 'src/features/billing'), 'note')).exitCode).toBe(0);
        expect(await read('src/features/billing/note.txt')).toBe('src/features/billing\n');
        expect((await run('note')).exitCode).toBe(0);
        expect(await read('note.txt')).toBe('.\n');
    });
});

describe('agent surface', () => {
    it('describes generators and their flags in the schema', async () => {
        await run('init');
        const { stdout, exitCode } = await run('schema');
        expect(exitCode).toBe(0);
        const schema = JSON.parse(stdout);
        expect(schema.commands.map((command: { name: string }) => command.name)).toEqual(['init', 'component', 'schema', 'skills']);
        const component = schema.commands.find((command: { name: string }) => command.name === 'component');
        expect(component.options.map((option: { flags: string }) => option.flags)).toEqual([
            '--name <text>',
            '--folder <choice>',
            '--story',
            '--no-story',
            '--dry-run',
            '--force',
        ]);
    });

    it('exits 2 with help and a reason when no command is given', async () => {
        await run('init');
        const { stdout, stderr, exitCode } = await run();
        expect(exitCode).toBe(2);
        expect(stdout).toBe('');
        expect(stderr).toContain('Usage: blop');
        expect(stderr).toContain('Error [no_command]: No command given.');
    });

    it('exits 0 for --help and --version', async () => {
        const help = await run('--help');
        expect(help.exitCode).toBe(0);
        expect(help.stdout).toContain('Run `blop init` to create one.');
        expect(help.stdout).toContain('Exit codes:');
        expect(await run('--version')).toMatchObject({ stdout: '0.1.0\n', exitCode: 0 });
    });

    it('exits 2 on an unknown option', async () => {
        await run('init');
        const { stderr, exitCode } = await run('component', '--name', 'Card', '--bogus');
        expect(exitCode).toBe(2);
        expect(stderr).toContain("Error [unknown_option]: Unknown option '--bogus'");
    });

    it('lists and prints the agent guides', async () => {
        const list = await run('skills', '--json');
        expect(JSON.parse(list.stdout).skills.map((skill: { name: string }) => skill.name)).toEqual(['core', 'config']);
        expect((await run('skills', 'get', 'core')).stdout).toStartWith('# blop: operating guide for agents');
        expect((await run('skills', 'stub')).stdout).toStartWith('---\nname: blop\n');
    });
});
