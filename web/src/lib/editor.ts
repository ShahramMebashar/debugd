export interface EditorPreset {
  name: string;
  template: string; // {file} = absolute path, {line} = line number
}

// Presets cover the common editors. {file} is substituted with the encoded
// absolute path; templates that put it after `file` (vscode/cursor) rely on the
// path's own leading slash, so no extra slash is added.
export const EDITORS: EditorPreset[] = [
  { name: "VS Code", template: "vscode://file{file}:{line}" },
  { name: "Cursor", template: "cursor://file{file}:{line}" },
  { name: "PhpStorm", template: "phpstorm://open?file={file}&line={line}" },
  { name: "Sublime Text", template: "subl://open?url=file://{file}&line={line}" },
  { name: "VS Code Insiders", template: "vscode-insiders://file{file}:{line}" },
  { name: "Windsurf", template: "windsurf://file{file}:{line}" },
];

export const DEFAULT_EDITOR = EDITORS[0].template;

/** Split a `relative/path.php:line` caller into its parts; null if unusable. */
export function splitCaller(caller: string): { file: string; line: number } | null {
  if (!caller || caller === "unknown") return null;
  const i = caller.lastIndexOf(":");
  if (i < 0) return null;
  const file = caller.slice(0, i);
  const line = Number.parseInt(caller.slice(i + 1), 10);
  if (!file || Number.isNaN(line)) return null;
  return { file, line };
}

/** Build an editor deep-link for a caller, or null when it can't be built. */
export function editorUrl(template: string, root: string, caller: string): string | null {
  if (!template || !root) return null;
  const parts = splitCaller(caller);
  if (!parts) return null;
  const abs = root.replace(/\/$/, "") + "/" + parts.file.replace(/^\//, "");
  return template.replace("{file}", encodeURI(abs)).replace("{line}", String(parts.line));
}
