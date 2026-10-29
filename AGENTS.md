# AGENTS.md

Guidance for AI coding agents (Claude Code, Codex, Cursor and others) working on this repository. `CLAUDE.md` imports this file.

## Commands

```bash
bun run cli.ts --help              # Run the CLI
bun run cli.ts init --dry-run      # Preview the starter config
bun test                           # Unit tests (lib/*.test.ts) and CLI integration tests (cli.test.ts)
bunx tsc --noEmit                  # Typecheck, including templates/blop.config.ts and the type-level tests
bun run compile                    # Compile to dist/blop
```

Run `bun test` and `bunx tsc --noEmit` before calling a change done.

## Architecture

blop is a code generator in the spirit of Plop, built on the buncli template (Commander, @inquirer/prompts, Bun). A project's `blop.config.ts` exports generators. Each generator becomes a command, and each of its prompts becomes a flag.

```
cli.ts                    # CLI entry: finds and loads the config, then registers commands
index.ts                  # Library entry: what blop.config.ts imports as 'blop'
commands/generate.ts      # One command per generator: prompts to flags, answers, cwd, run
commands/init.ts          # Writes templates/blop.config.ts, imported as text
commands/schema.ts        # The command tree as JSON
commands/skills.ts        # Agent guides from skills/*.md
lib/define.ts             # Prompt helpers, generator(), defineConfig(), answer and context types
lib/actions.ts            # add, append and modify descriptors
lib/plan.ts               # Pure: actions plus file contents in, a Plan out
lib/report.ts             # Pure: a Plan as text, with diffs on a dry run
lib/code.ts, lib/case.ts  # Pure template helpers
lib/run.ts                # The I/O shell: read files, plan, write everything or nothing
lib/config.ts             # Find, import and validate blop.config.ts
lib/cli.ts                # Context, output, ask, errors and exit codes (from buncli)
templates/blop.config.ts  # The starter config written by `blop init`
examples/blop.config.ts   # More example generators, one feature each, tested in cli.test.ts
skills/*.md               # Agent guides, compiled into the binary
```

A generator run goes: flags and prompts give the answers, `actions(answers, { cwd })` returns action descriptors, `lib/run.ts` reads every file they touch, `createPlan` works out the changes, and then every file is written or none is.

## Pure core, thin shell

Actions only describe changes. `createPlan` in `lib/plan.ts` is pure: it takes the actions and the current contents of every file they touch, and returns the changes and any problems. `lib/run.ts` is the only code that reads or writes project files, and it writes nothing when the plan has problems. Keep it that way:

- A new action type gets a case in `applyAction` and tests in `lib/plan.test.ts`.
- Anything read from the environment, like the `cwd` passed to actions, is computed in `commands/` and passed in, never read inside `lib/plan.ts`, `lib/report.ts`, `lib/code.ts` or `lib/case.ts`.

## Agent-ready contract

Every command must keep these guarantees from buncli.

- **Every input is passable as a flag.** Prompts are a fallback via `ask()`, which throws `missing_input` when `ctx.interactive` is false. Without a terminal, a prompt's default is used when it has one.
- **Results go through `output(ctx, data, text)`.** One line of JSON on stdout with `--json`, text otherwise. Diagnostics go to stderr.
- **Errors are thrown, never printed and exited.** `usageError()` (exit 2) for bad input, `CliError` (exit 1) for runtime failures, each with a stable snake_case code and a hint naming the next step.
- **Help text includes examples** via `.addHelpText('after', ...)`. Generator examples are built from their prompts.
- **The interface only grows.** Add commands, options, JSON fields and action context; don't rename or repurpose them. Error codes are listed in `skills/core.md`.

## Key conventions

- `index.ts` must stay the library entry. A compiled binary resolves a config's `import ... from 'blop'` to the package's `index.ts` and ignores `main` and `exports`.
- No top-level `await` in `cli.ts`. `--bytecode` builds emit CommonJS, which rejects it.
- New global flags or built-in commands must be added to `RESERVED_FLAGS` or `RESERVED_COMMANDS` in `lib/config.ts`, so configs can't collide with them.
- When the public API changes, update `skills/config.md` (the authoring guide in the binary) and the README to match.
- `cli.test.ts` runs the real CLI with no terminal, in a temp project whose `node_modules/blop` is a symlink to this repo.
- Markdown imports need `with { type: 'text' }`; their type comes from `env.d.ts`.
- `@inquirer/core` is a direct dependency only for `ExitPromptError`. Keep it on the same major version that `@inquirer/prompts` uses.
- TypeScript strict mode is on; avoid `any`.
