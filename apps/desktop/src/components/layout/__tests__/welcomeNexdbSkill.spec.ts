import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const locales = ["zh-CN", "en", "ja", "ko", "az", "tr", "es", "it", "pt-BR", "zh-TW"];

describe("NexDB-Skill welcome banner", () => {
  it("promotes the skill and links to the MCP package on GitHub", () => {
    const welcome = read("../WelcomeScreen.vue");
    const app = read("../../../App.vue");

    expect(welcome).toContain("NexDB-Skill");
    expect(welcome).not.toContain("npx @dbx-app/mcp-server");
    expect(welcome).toContain("emit('open-mcp-guide')");
    expect(app).toContain('openUrl("https://github.com/Mutantcat-Working-Group/NexDB/tree/main/packages/mcp-server");');
    expect(app).not.toContain('openUrl("https://dbxio.com/cn/docs/mcp");');
  });

  it("keeps a localized title and introduces the skill in every supported locale", () => {
    for (const locale of locales) {
      const source = read(`../../../i18n/locales/${locale}.ts`);
      expect(source, locale).toMatch(/mcpTitle: ".+"/);
      expect(source, locale).toMatch(/mcpDescription: .*NexDB-Skill/);
    }
  });
});
