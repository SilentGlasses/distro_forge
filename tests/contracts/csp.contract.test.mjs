import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAGES = ["index.html", "help/index.html", "third-party/index.html", "variants/index.html"];

for (const page of PAGES) {
  const html = readFileSync(new URL(`../../${page}`, import.meta.url), "utf8");

  test(`${page}: CSP forbids inline scripts`, () => {
    const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    assert.ok(csp, "expected a CSP meta tag");
    assert.match(csp, /script-src 'self'(;|$)/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  });

  test(`${page}: has no inline scripts or event handlers`, () => {
    // Every <script> must load a file; inline code would be blocked by the CSP.
    for (const tag of html.match(/<script\b[^>]*>/g) || []) {
      assert.match(tag, /\ssrc="/, `inline script found: ${tag}`);
    }
    assert.doesNotMatch(html, /\son[a-z]+\s*=/i, "inline event handler found");
  });
}
