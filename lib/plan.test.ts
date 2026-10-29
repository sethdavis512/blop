import { describe, expect, it } from 'bun:test';
import { add, append, modify, type Action } from './actions.ts';
import { createPlan, planPaths } from './plan.ts';

/** Plan against an in-memory set of files, loading every path the actions touch. */
function plan(actions: Action[], files: Record<string, string> = {}, options: { force?: boolean } = {}) {
    const loaded = new Map(planPaths(actions).map((path) => [path, files[path] ?? null]));
    return createPlan(actions, loaded, options);
}

describe('createPlan', () => {
    it('creates new files and updates existing ones', () => {
        const result = plan([add('a.ts', 'a\n'), append('index.ts', "export * from './a';")], { 'index.ts': 'x\n' });
        expect(result.problems).toEqual([]);
        expect(result.changes).toEqual([
            { path: 'a.ts', status: 'create', before: null, after: 'a\n' },
            { path: 'index.ts', status: 'update', before: 'x\n', after: "x\nexport * from './a';\n" },
        ]);
    });

    it('reports a problem instead of overwriting a file', () => {
        const result = plan([add('a.ts', 'new\n')], { 'a.ts': 'old\n' });
        expect(result.problems).toEqual([{ path: 'a.ts', code: 'file_exists', message: 'a.ts already exists' }]);
    });

    it('overwrites with force, but still skips when the generator says to', () => {
        const result = plan(
            [add('a.ts', 'new\n'), add('b.ts', '', { ifExists: 'skip' })],
            { 'a.ts': 'old\n', 'b.ts': 'keep\n' },
            { force: true },
        );
        expect(result.problems).toEqual([]);
        expect(result.changes.map(({ path, status, after }) => ({ path, status, after }))).toEqual([
            { path: 'a.ts', status: 'update', after: 'new\n' },
            { path: 'b.ts', status: 'skip', after: 'keep\n' },
        ]);
    });

    it('lets later actions build on earlier ones', () => {
        const result = plan([add('src/index.ts', '', { ifExists: 'skip' }), append('src/index.ts', 'one'), append('./src/index.ts', 'two')]);
        expect(result.changes).toEqual([{ path: 'src/index.ts', status: 'create', before: null, after: 'one\ntwo\n' }]);
    });

    it('appends after the line that matches, and only once', () => {
        const before = '// exports\nexport * from "./a";\n';
        const actions = [append('index.ts', 'export * from "./b";', { after: '// exports' })];
        expect(plan(actions, { 'index.ts': before }).changes[0]?.after).toBe('// exports\nexport * from "./b";\nexport * from "./a";\n');
        expect(plan(actions, { 'index.ts': 'export * from "./b";\n' }).changes[0]).toMatchObject({
            status: 'skip',
            reason: 'entry already present',
        });
    });

    it('matches regexes without leaking a g flag between runs', () => {
        const actions = [append('index.ts', 'b', { after: /^a$/gm })];
        for (let run = 0; run < 2; run++) {
            expect(plan(actions, { 'index.ts': 'a\nc\n' }).changes[0]?.after).toBe('a\nb\nc\n');
        }
    });

    it('reports appending or modifying a file that does not exist, or a pattern with no match', () => {
        const result = plan(
            [append('missing.ts', 'x'), modify('gone.ts', (source) => source), append('index.ts', 'x', { after: 'nope' })],
            { 'index.ts': 'a\n' },
        );
        expect(result.problems.map((problem) => problem.code)).toEqual(['file_missing', 'file_missing', 'no_match']);
    });

    it('rewrites with modify and marks a no-op as unchanged', () => {
        const upper = plan([modify('a.ts', (source) => source.toUpperCase())], { 'a.ts': 'a\n' });
        expect(upper.changes[0]).toMatchObject({ status: 'update', after: 'A\n' });
        const same = plan([modify('a.ts', (source) => source)], { 'a.ts': 'a\n' });
        expect(same.changes[0]).toMatchObject({ status: 'skip', reason: 'unchanged' });
    });

    it('throws when a path was not loaded first', () => {
        expect(() => createPlan([add('a.ts', '')], new Map())).toThrow("a.ts wasn't loaded");
    });
});
