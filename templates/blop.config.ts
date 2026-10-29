import { add, append, code, confirm, defineConfig, generator, pascal, select, text } from 'blop';

// Templates are plain functions that return a `code` template, so they can use
// any TypeScript: loops, conditions and helpers are just code.
const componentFile = (Name: string) => code`
    import type { ComponentPropsWithoutRef } from 'react';

    type ${Name}Props = ComponentPropsWithoutRef<'div'>;

    export function ${Name}({ className, ...props }: ${Name}Props) {
        return <div className={className} {...props} />;
    }
`;

const storyFile = (Name: string, folder: string) => code`
    import type { Meta, StoryObj } from '@storybook/react';
    import { ${Name} } from './${Name}';

    const meta = { title: '${folder}/${Name}', component: ${Name} } satisfies Meta<typeof ${Name}>;
    export default meta;

    export const Default: StoryObj<typeof meta> = {};
`;

export default defineConfig({
    component: generator({
        description: 'A React component, with an optional story',
        // Each prompt is also a flag: --name, --folder, --story / --no-story.
        prompts: {
            name: text('Component name'),
            folder: select('Folder', ['components', 'ui'], { default: 'components' }),
            story: confirm('Add a story?', { default: true }),
        },
        // Answers are typed from the prompts. Paths are relative to this file.
        actions: ({ name, folder, story }) => {
            const Name = pascal(name);
            const dir = `src/${folder}/${Name}`;
            return [
                add(`${dir}/${Name}.tsx`, componentFile(Name)),
                story && add(`${dir}/${Name}.stories.tsx`, storyFile(Name, folder)),
                add(`${dir}/index.ts`, `export * from './${Name}';\n`),
                // Create the barrel if it's missing, then add this component to it.
                add('src/index.ts', '', { ifExists: 'skip' }),
                append('src/index.ts', `export * from './${folder}/${Name}';`),
            ];
        },
    }),
});
