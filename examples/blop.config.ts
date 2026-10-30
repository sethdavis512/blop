import {
    add,
    append,
    camel,
    code,
    confirm,
    defineConfig,
    generator,
    kebab,
    modify,
    pascal,
    select,
    text,
    title,
    words,
} from 'blop';

// Example generators, each showing a different part of blop:
//
//   route         append after a matching line, optional blocks
//   hook          the { cwd } context: write where you run blop
//   ui-component  modify: rewrite package.json as JSON
//   model         select-driven templates, arrays and dropped lines
//
// To try them, copy this file into a project as blop.config.ts and preview one:
// `blop hook --name "window size" --dry-run`. route, ui-component and model add
// to files a project already has: app/routes.ts, package.json and
// prisma/schema.prisma.

// route: a React Router route module, registered in app/routes.ts.

// Optional blocks are separate `code` pieces joined with a blank line, so the
// spacing stays right whether or not the loader is there.
const routeModule = (file: string, Name: string, withLoader: boolean) =>
    [
        code`import type { Route } from './+types/${file}';`,
        withLoader && code`
            export async function loader({ request }: Route.LoaderArgs) {
                return { path: new URL(request.url).pathname };
            }
        `,
        code`
            export default function ${Name}(${withLoader ? '{ loaderData }: Route.ComponentProps' : ''}) {
                return <h1>${withLoader ? '{loaderData.path}' : title(Name)}</h1>;
            }
        `,
    ]
        .filter(Boolean)
        .join('\n');

// hook: a React hook, written into the folder blop runs from.

const hookFile = (hookName: string) => code`
    import { useState } from 'react';

    export function ${hookName}() {
        const [value, setValue] = useState<unknown>(null);
        return { value, setValue };
    }
`;

// ui-component: a component library entry with a barrel export and a
// package.json subpath export.

const libraryComponent = (Name: string) => code`
    import type { ComponentPropsWithoutRef } from 'react';

    export type ${Name}Props = ComponentPropsWithoutRef<'div'>;

    export function ${Name}({ className, ...props }: ${Name}Props) {
        return <div className={className} {...props} />;
    }
`;

// model: a Prisma model and a server module that maps rows to a clean shape.

type IdKind = 'cuid' | 'uuid' | 'autoincrement';
type Field = { name: string; type: string };

const tsTypes: Record<string, string> = {
    String: 'string',
    Int: 'number',
    Float: 'number',
    Boolean: 'boolean',
    DateTime: 'Date',
    Json: 'unknown',
};

/** "title:String, done:Boolean" to a list of fields. */
function parseFields(input: string): Field[] {
    return input
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
            const [name = '', type = 'String'] = part.split(':').map((piece) => piece.trim());
            return { name: camel(name), type };
        });
}

// Arrays render one item per line, and the deletedAt line disappears when
// softDelete is false.
const modelBlock = (Name: string, fields: Field[], id: IdKind, softDelete: boolean) => code`
    model ${Name} {
      id        ${id === 'autoincrement' ? 'Int      @id @default(autoincrement())' : `String   @id @default(${id}())`}
      ${fields.map((field) => `${field.name} ${field.type}`)}
      createdAt DateTime @default(now())
      updatedAt DateTime @updatedAt
      ${softDelete && 'deletedAt DateTime?'}
    }
`;

const modelServer = (Name: string, fields: Field[], id: IdKind, softDelete: boolean) => {
    const idType = id === 'autoincrement' ? 'number' : 'string';
    const shape = ['id: row.id', ...fields.map((field) => `${field.name}: row.${field.name}`)].join(', ');
    return code`
        import { prisma } from '~/db.server';

        export type ${Name} = {
            id: ${idType};
            ${fields.map((field) => `${field.name}: ${tsTypes[field.type] ?? 'unknown'};`)}
        };

        export async function get${Name}(id: ${idType}): Promise<${Name} | null> {
            const row = await prisma.${camel(Name)}.findFirst({ where: { id${softDelete ? ', deletedAt: null' : ''} } });
            return row && { ${shape} };
        }
    `;
};

export default defineConfig({
    route: generator({
        description: 'A React Router route module, registered in app/routes.ts',
        prompts: {
            path: text('Route path, like settings/billing or users/:id'),
            loader: confirm('Add a loader?', { default: true }),
        },
        actions: ({ path, loader }) => {
            const routePath = path.replace(/^\/+|\/+$/g, '');
            // users/:id lives in routes/users.$id.tsx
            const file = routePath.replaceAll('/', '.').replaceAll(':', '$');
            return [
                add(`app/routes/${file}.tsx`, routeModule(file, pascal(routePath), loader)),
                append('app/routes.ts', `    route('${routePath}', 'routes/${file}.tsx'),`, {
                    after: /^export default \[/m,
                }),
            ];
        },
    }),

    hook: generator({
        description: 'A React hook in the folder you run blop from',
        prompts: {
            name: text('Hook name, like window size'),
        },
        // cwd is where blop ran, relative to this file's folder.
        actions: ({ name }, { cwd }) => {
            const hookName = camel(words(name)[0] === 'use' ? name : `use ${name}`);
            return [add(`${cwd}/${kebab(hookName)}.ts`, hookFile(hookName))];
        },
    }),

    'ui-component': generator({
        description: 'A library component, exported from the barrel and a package.json subpath',
        prompts: {
            name: text('Component name'),
        },
        actions: ({ name }) => {
            const Name = pascal(name);
            const dir = `src/components/${Name}`;
            return [
                add(`${dir}/${Name}.tsx`, libraryComponent(Name)),
                add(`${dir}/index.ts`, `export * from './${Name}';\n`),
                append('src/index.ts', `export * from './components/${Name}';`, { create: true }),
                // modify takes a plain function, so JSON can be parsed and written back.
                modify('package.json', (source) => {
                    const pkg = JSON.parse(source) as { exports?: Record<string, string> };
                    const exports = { ...pkg.exports, [`./${kebab(name)}`]: `./${dir}/index.ts` };
                    return `${JSON.stringify({ ...pkg, exports }, null, 2)}\n`;
                }),
            ];
        },
    }),

    model: generator({
        description: 'A Prisma model and a server module for it',
        prompts: {
            name: text('Model name'),
            fields: text('Fields, like title:String, done:Boolean', { default: 'name:String' }),
            id: select('ID', ['cuid', 'uuid', 'autoincrement'], { default: 'cuid' }),
            softDelete: confirm('Soft delete with a deletedAt column?', { default: true }),
        },
        actions: ({ name, fields, id, softDelete }) => {
            const Name = pascal(name);
            const parsed = parseFields(fields);
            return [
                // The leading newline leaves a blank line before the model.
                append('prisma/schema.prisma', `\n${modelBlock(Name, parsed, id, softDelete)}`),
                add(`app/models/${kebab(name)}.server.ts`, modelServer(Name, parsed, id, softDelete)),
            ];
        },
    }),
});
