import { describe, expect, it } from 'bun:test';
import { code } from './code.ts';

describe('code', () => {
    it('strips the shared indentation and ends with one newline', () => {
        expect(code`
            function hi() {
                return 1;
            }
        `).toBe('function hi() {\n    return 1;\n}\n');
    });

    it('indents multi-line values to the column they are inserted at', () => {
        const body = 'a();\nb();';
        expect(code`
            function run() {
                ${body}
            }
        `).toBe('function run() {\n    a();\n    b();\n}\n');
    });

    it('drops a line whose only value renders nothing', () => {
        const imports = (withB: boolean) => code`
            import a from 'a';
            ${withB && "import b from 'b';"}
            run();
        `;
        expect(imports(false)).toBe("import a from 'a';\nrun();\n");
        expect(imports(true)).toBe("import a from 'a';\nimport b from 'b';\nrun();\n");
    });

    it('renders arrays one item per line, so nested code results stack', () => {
        const fields = ['id', 'name'].map((field) => code`${field}: string;`);
        expect(code`
            type Row = {
                ${fields}
            };
        `).toBe('type Row = {\n    id: string;\n    name: string;\n};\n');
    });

    it('keeps text raw except for escaped backticks and ${', () => {
        expect(code`log("a\nb", \`\${x}\`);`).toBe('log("a\\nb", `${x}`);\n');
    });

    it('returns an empty string for an empty template', () => {
        expect(code`
        `).toBe('');
    });
});
