import { createContext, useContext, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { editorUrl } from "@/lib/editor";

// Inside the Tauri webview, navigating a custom scheme via <a href> is silently
// swallowed, so hand editor deep-links to the OS opener instead. In the browser
// this is false and the plain href takes over.
const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const Ctx = createContext<{ root: string; template: string }>({ root: "", template: "" });

export function CodeLinkProvider({ root, template, children }: { root: string; template: string; children: ReactNode }) {
  return <Ctx.Provider value={{ root, template }}>{children}</Ctx.Provider>;
}

/** Renders a `file.php:line` caller as a visibly-clickable link that opens it in
 *  the configured editor. Falls back to plain text when no link can be built
 *  (e.g. an old trace with no project_root, or an unknown caller). */
export function CodeLink({ caller, className = "" }: { caller: string; className?: string }) {
  const { root, template } = useContext(Ctx);
  const url = editorUrl(template, root, caller);
  if (!url) return <span className={className}>{caller}</span>;
  return (
    <a
      href={url}
      title="Open in editor"
      onClick={(e) => {
        e.stopPropagation();
        if (isTauri()) {
          e.preventDefault();
          void openUrl(url);
        }
      }}
      className={`inline-flex min-w-0 items-center gap-0.5 text-sky-600 underline-offset-2 hover:underline dark:text-sky-400 ${className}`}
    >
      <span className="truncate">{caller}</span>
      <ArrowUpRight className="size-3 shrink-0 opacity-70" />
    </a>
  );
}
