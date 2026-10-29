# blop: writing blop.config.ts

A config's default export maps command names to generators. Each generator has prompts, which become flags, and an `actions` function, which turns the answers into file changes. `blop init` writes a working starter.

```ts
import { add, append, code, confirm, defineConfig, generator, pascal, select, text } from 'blop';

const componentFile = (Name: string) => code`
    export function ${Name}() {
        return <div />;
    }
`;

export default defineConfig({
    component: generator({
        description: 'A React component',
        prompts: {
            name: text('Component name'),
            folder: select('Folder', ['components', 'ui'], { default: 'components' }),
            story: confirm('Add a story?', { default: true }),
        },
        actions: ({ name, folder, story }) => {
            const Name = pascal(name);
            return [
                add(`src/${folder}/${Name}/${Name}.tsx`, componentFile(Name)),
                story && add(`src/${folder}/${Name}/${Name}.stories.tsx`, '...'),
                append('src/index.ts', `export * from './${folder}/${Name}';`),
            ];
        },
    }),
});
```

Always wrap a generator in `generator()`. That is what types `answers` from `prompts`: here `name` is a `string`, `folder` is `'components' | 'ui'` and `story` is a `boolean`.

## Prompts

| Helper | Answer type | Flag |
| --- | --- | --- |
| `text(message, { default? })` | `string` | `--key <text>` |
| `select(message, choices, { default? })` | the choices, as a union | `--key <choice>` |
| `confirm(message, { default? })` | `boolean` | `--key` / `--no-key` |

Prompt keys can't be `config`, `json`, `nonInteractive`, `dryRun`, `force`, `help` or `version`, and generator names can't be `init`, `schema`, `skills` or `help`.

## Actions

`actions` returns an array, or a promise of one. Falsy entries are skipped, so `condition && add(...)` works. Paths are relative to the config file's folder. Actions run in order, and each sees the changes before it.

`actions` gets a context as its second argument. `cwd` is the folder blop was run from, relative to the config's folder (`.` at the root), so a generator can put files where the user is standing while still updating fixed files:

```ts
actions: ({ name }, { cwd }) => [
    add(`${cwd}/${pascal(name)}.tsx`, componentFile(pascal(name))),
    append('src/index.ts', `export * from './${name}';`),
],
```

| Helper | Does | Fails when |
| --- | --- | --- |
| `add(path, content, { ifExists? })` | Creates a file. `ifExists` is `'error'` (default), `'skip'` or `'overwrite'`. | The file exists and `ifExists` is `'error'`, unless `--force` is passed. |
| `append(path, entry, { after?, unique? })` | Puts the entry on its own line at the end, or after the line matching `after` (a string or RegExp). With `unique` (default `true`), an entry already in the file is skipped. | The file doesn't exist, or `after` doesn't match. |
| `modify(path, (source) => string)` | Rewrites a file with a function of its contents. | The file doesn't exist. |

To create a file only if it's missing and then add to it, use `add(path, '', { ifExists: 'skip' })` followed by `append(path, entry)`.

## Templates with `code`

Templates are functions that return a `code` tagged template:

- Indent the template to match your source. `code` removes the shared indentation and ends the result with one newline.
- A multi-line value is indented to the column it's inserted at, so nested `code` results line up.
- `null`, `undefined` and `false` render nothing, and a line holding only such a value is removed: `${story && "import './story';"}`.
- Arrays render one item per line: `${fields.map((field) => code`${field}: string;`)}`.
- Text is raw: `\n` stays a backslash and an n in the output. Write \` and \${ to emit a backtick or `${`.

## Case helpers

`pascal`, `camel`, `kebab`, `snake`, `constant` and `title` convert names like `fancy button`, `fancyButton` or `FANCY_BUTTON`. `words` splits a name into lowercase words.

## Check your work

Run the generator with `--dry-run` after every change to the config. Run `tsc --noEmit` in the project to type-check the templates.
