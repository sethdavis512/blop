// Markdown files imported with `with { type: 'text' }` are inlined as strings
// by Bun, including in compiled binaries.
declare module '*.md' {
    const content: string;
    export default content;
}