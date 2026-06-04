import { describe, it, expect } from "vitest";
import { splitCaller, editorUrl } from "./editor";

describe("splitCaller", () => {
  it("splits file:line", () => {
    expect(splitCaller("app/Foo.php:82")).toEqual({ file: "app/Foo.php", line: 82 });
  });
  it("returns null for unknown / no line", () => {
    expect(splitCaller("unknown")).toBeNull();
    expect(splitCaller("app/Foo.php")).toBeNull();
    expect(splitCaller("")).toBeNull();
  });
});

describe("editorUrl", () => {
  const root = "/Users/me/app";

  it("builds a VS Code url with an absolute path", () => {
    expect(editorUrl("vscode://file{file}:{line}", root, "app/Foo.php:82")).toBe(
      "vscode://file/Users/me/app/app/Foo.php:82",
    );
  });

  it("builds a PhpStorm url", () => {
    expect(editorUrl("phpstorm://open?file={file}&line={line}", root, "app/Bar.php:9")).toBe(
      "phpstorm://open?file=/Users/me/app/app/Bar.php&line=9",
    );
  });

  it("encodes spaces in the path but keeps slashes", () => {
    expect(editorUrl("vscode://file{file}:{line}", "/Users/My Projects/app", "app/X.php:1")).toBe(
      "vscode://file/Users/My%20Projects/app/app/X.php:1",
    );
  });

  it("returns null when template, root, or caller is unusable", () => {
    expect(editorUrl("", root, "app/Foo.php:1")).toBeNull();
    expect(editorUrl("vscode://file{file}:{line}", "", "app/Foo.php:1")).toBeNull();
    expect(editorUrl("vscode://file{file}:{line}", root, "unknown")).toBeNull();
  });
});
