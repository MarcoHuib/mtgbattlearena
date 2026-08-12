import { readFileSync } from "node:fs"

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8")

test("homepage bevat de indexeerbare SEO-contracten", () => {
  const html = read("../index.html")
  expect(html).toContain("<title>MTG Battle Arena — Digitale Magic-tafel</title>")
  expect(html).toContain('<meta name="robots" content="index, follow" />')
  expect(html).toContain('<link rel="canonical" href="https://mtgbattlearena.nl/" />')
  expect(html).toContain('"@type": "WebSite"')
  expect(html).toContain('"name": "MTG Battle Arena"')
  expect(html).toContain("<h1>MTG Battle Arena</h1>")
  expect(html).toContain("<noscript data-nosnippet>")
  expect(html).toContain('window.location.pathname !== "/"')
  expect(html).toContain('"noindex, follow"')
})

test("robots en sitemap zijn echte publieke statische assets", () => {
  expect(read("../public/robots.txt")).toBe(
    "User-agent: *\nAllow: /\nSitemap: https://mtgbattlearena.nl/sitemap.xml\n",
  )
  const sitemap = read("../public/sitemap.xml")
  expect(sitemap.match(/<url>/g)).toHaveLength(1)
  expect(sitemap).toContain("<loc>https://mtgbattlearena.nl/</loc>")
})
