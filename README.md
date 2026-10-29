# blop

A tiny, typed code generator for Bun, in the spirit of [Plop](https://plopjs.com/).

Plop made it normal to keep generators in your repo, so every new component or route starts from your team's own patterns. blop brings that idea to Bun, and the name says so: Bun plus Plop.

- **Prompts become flags.** Every generator is a command, and every prompt is a flag, so the same generator works at a terminal, in a script, or for an AI agent.
- **Templates are TypeScript.** No Handlebars: a template is a function that returns a `code` tagged template, and its inputs are typed from the prompts.
- **Every run is planned first.** Actions describe changes, blop works out the result, and then it writes every file or none. `--dry-run` shows the diffs.

## Quick start

blop isn't on npm yet. Install it from GitHub as a dev dependency in your project:

```bash
bun add -d git+ssh://git@github.com/sethdavis512/blop.git
bunx blop init
bunx blop component --name "fancy button" --dry-run
```

`blop init` writes a starter `blop.config.ts` with a `component` generator. Commit it, and everyone on the project gets the same generators. Run `bunx blop` on its own to pick a generator and answer its prompts, or add `"blop": "blop"` to your package.json scripts and run `bun blop`.

## Writing generators

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
        // answers: { name: string; folder: 'components' | 'ui'; story: boolean }
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

That generator is `blop component --name <text> --folder <components|ui> --story`. The full starter is in [templates/blop.config.ts](templates/blop.config.ts).

[examples/blop.config.ts](examples/blop.config.ts) has more generators to copy, each showing a different feature: a React Router route registered in `app/routes.ts`, a hook written where you run blop, a library component with a package.json subpath export, and a Prisma model with a server module.

| Prompt | Answer type | Flag |
| --- | --- | --- |
| `text(message, { default? })` | `string` | `--key <text>` |
| `select(message, choices, { default? })` | the choices, as a union | `--key <choice>` |
| `confirm(message, { default? })` | `boolean` | `--key` / `--no-key` |

| Action | Does |
| --- | --- |
| `add(path, content, { ifExists? })` | Creates a file. Fails if it exists, unless `ifExists` is `'skip'` or `'overwrite'`, or `--force` is passed. |
| `append(path, entry, { after?, unique? })` | Adds a line at the end, or after the line matching `after`. Skips entries that are already there. |
| `modify(path, (source) => string)` | Rewrites a file with a function of its contents. |

Paths are relative to the config file. Actions run in order and each sees the changes before it, and falsy entries are skipped, so `condition && add(...)` works.

`actions` also receives `{ cwd }`: the folder blop ran in, relative to the config (`.` at the root). Use it for files that belong where you're standing, like `` add(`${cwd}/${Name}.tsx`, ...) ``, while fixed files such as `src/index.ts` keep their root paths.

### The `code` tag

- Indent templates to match your code. `code` removes the shared indentation and ends with one newline.
- Multi-line values are indented to the column they're inserted at.
- `false`, `null` and `undefined` render nothing, and a line holding only one of them is removed.
- Arrays render one item per line.
- Text is raw, so `\n` stays `\n` in the output. Write \` and \${ for a literal backtick or `${`.

Case helpers: `pascal`, `camel`, `kebab`, `snake`, `constant`, `title` and `words`.

## CLI

Inside a project, run these through `bunx blop` or a package.json script.

```bash
blop                                   # pick a generator, answer its prompts
blop <generator> --help                # its flags, built from its prompts
blop <generator> [flags] --dry-run     # every change, with diffs; writes nothing
blop <generator> [flags] --force       # overwrite files that exist
blop init                              # create a starter blop.config.ts
blop --config path/to/blop.config.ts   # use a specific config
```

blop uses the nearest `blop.config.ts`, `.js` or `.mjs` in the current folder or above it.

## Built for AI agents

blop keeps the [buncli](https://github.com/sethdavis512/buncli) contract: `--json` output, `--non-interactive`, stable error codes with hints, and exit codes `0` (success), `1` (runtime error) and `2` (usage error). Without a terminal it never prompts. A missing answer uses the prompt's default, or fails with `missing_input`.

```bash
blop schema                   # every generator and flag as JSON
blop skills get core          # operating guide for agents
blop skills get config        # how to write generators
blop skills stub > ~/.claude/skills/blop/SKILL.md
```

## Development

To work on blop itself, clone it, run `bun install` and `bun link`, then run `bun link blop` in a project to use your checkout there. [AGENTS.md](AGENTS.md) covers the architecture and conventions.

| Script | What it does |
| --- | --- |
| `bun start` | Run the CLI (`bun run cli.ts`) |
| `bun test` | Unit tests for the pure core, plus CLI integration tests |
| `bun run typecheck` | Typecheck, including the starter config |
| `bun run compile` | Compile a standalone binary to `dist/blop` |
| `bun run compile:all` | Cross-compile for Linux, macOS and Windows |

A compiled binary still needs `blop` installed in the project, because configs import it.

## License

[MIT](LICENSE) © Seth Davis
