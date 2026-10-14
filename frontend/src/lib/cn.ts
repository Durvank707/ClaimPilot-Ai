/**
 * Tiny class-name joiner. Avoids pulling in clsx/tailwind-merge for the small
 * number of conditional classes used in this UI.
 */
export function cn(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(' ')
}
