/**
 * Tag for code templates. Indent the template to match the surrounding source:
 * `code` strips the shared indentation, indents multi-line values to the
 * column they're inserted at, and ends the result with exactly one newline.
 *
 * - Text is raw, like `String.raw`: `\n` stays a backslash and an n. Only
 *   \` and \${ are unescaped, so a template can emit backticks and `${`.
 * - `null`, `undefined` and `false` render nothing, and a line holding only
 *   such a value is dropped, so `${cond && 'line'}` adds or leaves out a line.
 * - Arrays render one item per line, so mapped `code` results stack.
 */
export function code(strings: TemplateStringsArray, ...values: readonly unknown[]): string {
    const parts = strings.raw.map(unescape);
    let text = parts[0] ?? '';
    for (const [index, value] of values.entries()) {
        let next = parts[index + 1] ?? '';
        const line = currentLine(text);
        const rendered = render(value);
        if (rendered === '' && line.trim() === '' && /^[ \t]*\n/.test(next)) {
            // The value sat alone on its line and rendered nothing: drop the line.
            text = text.slice(0, text.length - line.length);
            next = next.replace(/^[ \t]*\n/, '');
        } else {
            text += rendered.replace(/\n(?=[^\n])/g, `\n${leadingWhitespace(line)}`);
        }
        text += next;
    }
    return dedent(text);
}

function unescape(part: string): string {
    return part.replace(/\\(`|\$\{)/g, '$1');
}

function render(value: unknown): string {
    if (value === null || value === undefined || value === false) return '';
    if (Array.isArray(value)) return value.map(render).filter((item) => item !== '').join('\n');
    // Nested `code` results end with a newline; the template supplies its own.
    return String(value).replace(/\n$/, '');
}

function currentLine(text: string): string {
    return text.slice(text.lastIndexOf('\n') + 1);
}

function leadingWhitespace(line: string): string {
    return /^[ \t]*/.exec(line)?.[0] ?? '';
}

function dedent(text: string): string {
    const lines = text.replace(/^([ \t]*\n)+/, '').replace(/(\n[ \t]*)+$/, '').split('\n');
    const filled = lines.filter((line) => line.trim() !== '');
    if (filled.length === 0) return '';
    const margin = Math.min(...filled.map((line) => leadingWhitespace(line).length));
    return `${lines.map((line) => (line.trim() === '' ? '' : line.slice(margin))).join('\n')}\n`;
}
