import type { Action } from './actions.ts';

export type TextPrompt = { kind: 'text'; message: string; default?: string };
export type SelectPrompt<T extends string = string> = {
    kind: 'select';
    message: string;
    choices: readonly T[];
    default?: T;
};
export type ConfirmPrompt = { kind: 'confirm'; message: string; default?: boolean };
export type Prompt = TextPrompt | SelectPrompt | ConfirmPrompt;
export type Prompts = Readonly<Record<string, Prompt>>;

type AnswerFor<P extends Prompt> = P extends SelectPrompt<infer T> ? T : P extends ConfirmPrompt ? boolean : string;

/** What a generator's `actions` receives, typed from its prompts. */
export type Answers<P extends Prompts> = { readonly [K in keyof P]: AnswerFor<P[K]> };

/** An action, or a falsy value so `condition && add(...)` can leave one out. */
export type MaybeAction = Action | false | null | undefined;

/** Where a generator was run, passed to `actions` with the answers. */
export type GeneratorContext = {
    /**
     * The folder blop was run from, relative to the config's folder: `.` at the
     * root, `src/features/billing` deeper in. Use it in the paths of files that
     * belong where you're standing.
     */
    cwd: string;
};

export type Generator<P extends Prompts = Prompts> = {
    description?: string;
    /** Each prompt is also a flag: `--name`, `--with-story` / `--no-with-story`. */
    prompts: P;
    // Method syntax keeps a generator with specific prompts assignable to `Generator`.
    actions(answers: Answers<P>, context: GeneratorContext): readonly MaybeAction[] | Promise<readonly MaybeAction[]>;
};

/** The default export of blop.config.ts: generators keyed by command name. */
export type Config = Readonly<Record<string, Generator>>;

export function text(message: string, options: { default?: string } = {}): TextPrompt {
    return { kind: 'text', message, ...options };
}

export function select<const T extends string>(
    message: string,
    choices: readonly T[],
    options: { default?: NoInfer<T> } = {},
): SelectPrompt<T> {
    return { kind: 'select', message, choices, ...options };
}

export function confirm(message: string, options: { default?: boolean } = {}): ConfirmPrompt {
    return { kind: 'confirm', message, ...options };
}

/** Define a generator. Wrapping it in `generator()` is what types `answers` from `prompts`. */
export function generator<P extends Prompts>(definition: Generator<P>): Generator<P> {
    return definition;
}

export function defineConfig(config: Config): Config {
    return config;
}
