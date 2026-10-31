import { describe, expect, it } from "vitest";
import { findFirstUrl, isPublicHost, parseHtml, fetchLink } from "../../supabase/functions/_shared/link";

describe("link reading", () => {
  it("finds the first link and trims trailing punctuation", () => {
    expect(findFirstUrl("read this https://example.com/a?b=1. later")).toBe("https://example.com/a?b=1");
    expect(findFirstUrl("(see https://en.wikipedia.org/wiki/Foo_(bar))")).toBe("https://en.wikipedia.org/wiki/Foo_(bar)");
    expect(findFirstUrl("no link here")).toBeNull();
  });

  it("refuses private and local addresses", () => {
    expect(isPublicHost("localhost")).toBe(false);
    expect(isPublicHost("127.0.0.1")).toBe(false);
    expect(isPublicHost("192.168.1.5")).toBe(false);
    expect(isPublicHost("169.254.169.254")).toBe(false);
    expect(isPublicHost("10.0.0.1")).toBe(false);
    expect(findFirstUrl("http://localhost:3000/x")).toBeNull();
    expect(isPublicHost("myvinx.tech")).toBe(true);
  });

  it("pulls title, description, image and readable text, skipping scripts and nav", () => {
    const html = `<html><head><title>Fallback</title>
      <meta property="og:title" content="Cats &amp; Dogs">
      <meta name="description" content="A guide">
      <meta property="og:image" content="/img.png"></head>
      <body><nav>Menu</nav><script>evil()</script><article><p>First para.</p><p>Second para.</p></article></body></html>`;
    const r = parseHtml(html, "https://site.com/post");
    expect(r.title).toBe("Cats & Dogs");
    expect(r.description).toBe("A guide");
    expect(r.image).toBe("https://site.com/img.png");
    expect(r.text).toBe("First para.\nSecond para.");
  });

  it("blocks internal hosts before fetching", async () => {
    expect((await fetchLink("http://127.0.0.1/admin")).error).toBe("blocked host");
  });
});
