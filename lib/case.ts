/**
 * Split a name into lowercase words. "fancyButton", "fancy-button",
 * "Fancy Button" and "FANCY_BUTTON" all give ["fancy", "button"].
 */
export function words(input: string): string[] {
    return input
        .replace(/([a-z\d])([A-Z])/g, '$1 $2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
        .split(/[^A-Za-z\d]+/)
        .filter(Boolean)
        .map((word) => word.toLowerCase());
}

function capitalize(word: string): string {
    return word.charAt(0).toUpperCase() + word.slice(1);
}

/** FancyButton */
export function pascal(input: string): string {
    return words(input).map(capitalize).join('');
}

/** fancyButton */
export function camel(input: string): string {
    const name = pascal(input);
    return name.charAt(0).toLowerCase() + name.slice(1);
}

/** fancy-button */
export function kebab(input: string): string {
    return words(input).join('-');
}

/** fancy_button */
export function snake(input: string): string {
    return words(input).join('_');
}

/** FANCY_BUTTON */
export function constant(input: string): string {
    return snake(input).toUpperCase();
}

/** Fancy Button */
export function title(input: string): string {
    return words(input).map(capitalize).join(' ');
}
