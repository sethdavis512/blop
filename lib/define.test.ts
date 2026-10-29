import { describe, expect, it } from 'bun:test';
import { add } from './actions.ts';
import { confirm, generator, select, text, type Answers } from './define.ts';

// Type-level checks: `tsc --noEmit` fails if these don't hold.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertType<_T extends true>(): void {}

describe('generator', () => {
    it('types answers from prompts', () => {
        const prompts = {
            name: text('Name'),
            folder: select('Folder', ['components', 'ui'], { default: 'ui' }),
            story: confirm('Story?'),
        };
        assertType<Equal<Answers<typeof prompts>, { readonly name: string; readonly folder: 'components' | 'ui'; readonly story: boolean }>>();

        const component = generator({
            prompts,
            actions: ({ name, story }, { cwd }) => [add(`${cwd}/${name}.tsx`, ''), story && add(`${name}.stories.tsx`, '')],
        });
        expect(component.actions({ name: 'Card', folder: 'ui', story: false }, { cwd: 'src' })).toEqual([
            add('src/Card.tsx', ''),
            false,
        ]);
        expect(component.prompts.folder).toEqual({ kind: 'select', message: 'Folder', choices: ['components', 'ui'], default: 'ui' });
    });
});
