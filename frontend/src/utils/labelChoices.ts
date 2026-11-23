/** Keep selected stale names visible so the user can explicitly clear them. */
export function labelChoices(vocabulary: string[], selected: string[] = []): string[] {
  return [...new Set([...vocabulary, ...selected])];
}
