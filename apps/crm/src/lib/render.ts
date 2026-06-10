/** Render a message template with per-customer variables. Unknown placeholders → empty. */
export function renderMessage(
  template: string,
  vars: { name: string; persona: string; offer?: string | null }
): string {
  const firstName = vars.name.split(" ")[0] ?? vars.name;
  return template
    .replaceAll("{name}", firstName)
    .replaceAll("{persona}", vars.persona)
    .replaceAll("{offer}", vars.offer ?? "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
