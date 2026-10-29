# blop

A tiny, typed code generator for Bun, in the spirit of [Plop](https://plopjs.com/).

Plop made it normal to keep generators in your repo, so every new component or route starts from your team's own patterns. blop brings that idea to Bun, and the name says so: Bun plus Plop.

- **Prompts become flags.** Every generator is a command, and every prompt is a flag, so the same generator works at a terminal, in a script, or for an AI agent.
- **Templates are TypeScript.** No Handlebars: a template is a function that returns a `code` tagged template, and its inputs are typed from the prompts.
- **Every run is planned first.** Actions describe changes, blop works out the result, and then it writes every file or none. `--dry-run` shows the diffs.

## Use cases

- **Components that arrive complete.** One run creates the component, its story and its barrel file, and adds the export to `src/index.ts`. In a component library, a `modify` step adds the package.json subpath export too. See `ui-component` in the [examples](examples/blop.config.ts).
- **Routes registered in one step.** Create a React Router route module with its `Route` types imported, and add its `route()` entry to `app/routes.ts` in the same run. See `route`.
- **Data models from schema to server.** Add a model to `schema.prisma` and write the server module that maps its rows to clean typed objects, so every model follows the same shape. See `model`.
- **Files right where you're working.** With `{ cwd }`, a generator can put a hook, a test or a feature slice in the folder you run it from, and still update shared files like barrels. See `hook`.
- **Endpoints and background jobs, wired up.** Write a handler and register it with the router or the task index in one run, so every new endpoint is connected the moment it exists.
- **Environment variables everywhere they belong.** One generator can add a variable to `.env.example`, the env validation schema and the deploy config, so a new setting never lands halfway.
- **Team conventions as a package.** Generators are plain TypeScript, so a team can publish them as a package and import them into each project's `blop.config.ts`, renaming them or picking only the ones a project needs.
- **Scaffolding by AI agents.** An agent finds the generators with `blop schema`, previews with `--dry-run --json`, then writes. It follows the project's own patterns instead of writing boilerplate from memory, and `blop skills stub` gives it the instructions.

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

### Templates and the `code` tag

A template is a TypeScript function that returns a `code` tagged template. There's no template language to learn, and that buys you a few things:

- **Type checking.** Template inputs are typed from the prompts, so a typo like `${Nmae}` is a type error instead of an empty string in the output.
- **Plain logic.** Use `map`, ternaries and `&&` where a template language would need `{{#each}}` and `{{#if}}`.
- **Nothing to register.** Helpers are imports, and partials are functions you call.

`code` takes care of the whitespace:

- Indent templates to match your code. `code` removes the shared indentation and ends with one newline.
- Multi-line values are indented to the column they're inserted at, so nested `code` results line up.
- `false`, `null` and `undefined` render nothing, and a line holding only one of them is removed.
- Arrays render one item per line.

```ts
const row = (fields: string[], withDone: boolean) => code`
    type Row = {
        ${fields.map((field) => `${field}: string;`)}
        ${withDone && 'done: boolean;'}
    };
`;

row(['id', 'title'], false);
```

```ts
type Row = {
    id: string;
    title: string;
};
```

**Optional blocks.** A dropped line removes just that line. For an optional block with blank lines around it, build each block as its own `code` piece and join them. Every `code` result ends with one newline, so joining with `'\n'` leaves one blank line between blocks:

```ts
const routeModule = (withLoader: boolean) =>
    [
        code`import type { Route } from './+types/home';`,
        withLoader && code`
            export async function loader() {
                return { message: 'Hello' };
            }
        `,
        code`
            export default function Home() {
                return <h1>Home</h1>;
            }
        `,
    ]
        .filter(Boolean)
        .join('\n');
```

**Escaping.** Text is raw, like `String.raw`, so `\n` in a template stays `\n` in the generated file. To generate code with its own backticks or `${`, escape them as \` and \${:

```ts
code`const greeting = \`Hello, \${name}\`;`
// writes: const greeting = `Hello, ${name}`;
```

### Case helpers

`blop` exports helpers that turn an answer into names. They accept any style, so `fancy button`, `fancyButton`, `fancy-button` and `FANCY_BUTTON` all give the same result:

| Helper | `fancy button` becomes |
| --- | --- |
| `pascal` | `FancyButton` |
| `camel` | `fancyButton` |
| `kebab` | `fancy-button` |
| `snake` | `fancy_button` |
| `constant` | `FANCY_BUTTON` |
| `title` | `Fancy Button` |
| `words` | `['fancy', 'button']` |

Templates are plain TypeScript, so any other function works too, whether it's your own or a package like `change-case`.

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

### Output and errors

With `--json`, a run prints one line on stdout:

```json
{"generator":"component","answers":{"name":"Card","folder":"components","story":false},"dryRun":false,"changes":[{"path":"src/components/Card/Card.tsx","status":"create"},{"path":"src/components/Card/index.ts","status":"create"},{"path":"src/index.ts","status":"update"}]}
```

Each change's `status` is `create`, `update` or `skip`, and a skipped file has a `reason` such as `already exists`. Errors are one line on stderr, and stdout stays empty:

```json
{"error":{"code":"missing_input","message":"Missing required input: name.","hint":"Pass it with `--name <text>`. `blop component --help` lists every flag."}}
```

| Code | Exit | When |
| --- | --- | --- |
| `missing_input` | 2 | A prompt with no default wasn't passed, and nobody can be asked. |
| `invalid_input` | 2 | A text flag was empty. |
| `invalid_argument` | 2 | A select flag isn't one of its choices. |
| `unknown_command`, `unknown_option` | 2 | Not a generator or flag in this config. `blop schema` lists them. |
| `no_command` | 2 | No command was given, and nobody can be asked to pick a generator. |
| `unknown_skill` | 2 | `blop skills get` was given a guide that doesn't exist. |
| `conflict` | 1 | An action failed: a file exists, a file to change is missing, or a pattern didn't match. Nothing was written. |
| `config_not_found` | 1 | No `blop.config.ts` in the current folder or above it. `blop init` creates one. |
| `invalid_config` | 1 | The config's default export isn't a set of generators, or a name clashes with a built-in. |
| `blop_not_installed` | 1 | The config imports `blop`, but the project can't resolve it. |
| `internal_error` | 1 | Anything unexpected, such as a syntax error in the config. |

Other Commander parse errors, such as `missing_argument`, also exit 2.

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
