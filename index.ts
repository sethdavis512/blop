// The public API: everything blop.config.ts imports from 'blop'. It lives in
// index.ts because a compiled blop binary loads a package's index.ts when a
// config imports it, ignoring package.json's main and exports (Bun 1.4).
export { add, append, modify, type Action, type AddAction, type AppendAction, type ModifyAction } from './lib/actions.ts';
export { camel, constant, kebab, pascal, snake, title, words } from './lib/case.ts';
export { code } from './lib/code.ts';
export {
    confirm,
    defineConfig,
    generator,
    select,
    text,
    type Answers,
    type Config,
    type Generator,
    type GeneratorContext,
    type Prompt,
    type Prompts,
} from './lib/define.ts';
