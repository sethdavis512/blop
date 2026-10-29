import { describe, expect, it } from 'bun:test';
import { camel, constant, kebab, pascal, snake, title, words } from './case.ts';

describe('case helpers', () => {
    it('split names written in any style into the same words', () => {
        for (const input of ['fancy button', 'fancyButton', 'FancyButton', 'fancy-button', 'FANCY_BUTTON']) {
            expect(words(input)).toEqual(['fancy', 'button']);
        }
    });

    it('keep acronyms and digits together', () => {
        expect(words('HTTPServer')).toEqual(['http', 'server']);
        expect(words('button2Large')).toEqual(['button2', 'large']);
    });

    it('convert to each case', () => {
        expect(pascal('fancy button')).toBe('FancyButton');
        expect(camel('fancy button')).toBe('fancyButton');
        expect(kebab('FancyButton')).toBe('fancy-button');
        expect(snake('FancyButton')).toBe('fancy_button');
        expect(constant('fancy-button')).toBe('FANCY_BUTTON');
        expect(title('fancy_button')).toBe('Fancy Button');
    });
});
