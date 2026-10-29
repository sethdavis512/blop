import { describe, expect, it } from 'bun:test';
import type { Plan } from './plan.ts';
import { formatPlan } from './report.ts';

const plan: Plan = {
    problems: [],
    changes: [
        { path: 'src/Card.tsx', status: 'create', before: null, after: 'export function Card() {}\n' },
        { path: 'src/index.ts', status: 'update', before: 'a\nb\nc\nd\n', after: 'a\nb\nc\nnew\nd\n' },
        { path: 'src/keep.ts', status: 'skip', before: 'x\n', after: 'x\n', reason: 'already exists' },
    ],
};

describe('formatPlan', () => {
    it('lists each file and counts what was written', () => {
        expect(formatPlan(plan, { dryRun: false })).toBe(
            ['create  src/Card.tsx', 'update  src/index.ts', 'skip    src/keep.ts (already exists)', '', 'Wrote 2 files.'].join('\n'),
        );
    });

    it('adds diffs with two lines of context on a dry run', () => {
        expect(formatPlan(plan, { dryRun: true })).toBe(
            [
                'create  src/Card.tsx',
                '    + export function Card() {}',
                'update  src/index.ts',
                '      b',
                '      c',
                '    + new',
                '      d',
                'skip    src/keep.ts (already exists)',
                '',
                'Dry run: 2 files would be written.',
            ].join('\n'),
        );
    });
});
