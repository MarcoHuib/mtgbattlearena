import { readFileSync } from "node:fs"

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8")

test("homepage bevat de indexeerbare SEO-contracten", () => {
  const html = read("../index.html")
  const compactHtml = html.replace(/\s+/g, " ")
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1]
  expect(title).toMatch(/^MTG Battle Arena\b/)
  expect(title).toContain("Magic")
  expect(compactHtml).toMatch(
    /<meta name="description" content="[^"]*MTG Battle Arena[^"]*" \/>/,
  )
  expect(compactHtml).toContain(
    '<meta name="robots" content="index, follow" />',
  )
  expect(compactHtml).toContain(
    '<link rel="canonical" href="https://mtgbattlearena.nl/" />',
  )
  expect(compactHtml).toContain(
    '<meta property="og:site_name" content="MTG Battle Arena" />',
  )
  expect(compactHtml).toMatch(
    /<meta property="og:title" content="MTG Battle Arena[^"]*" \/>/,
  )
  expect(compactHtml).toContain(
    '<meta property="og:url" content="https://mtgbattlearena.nl/" />',
  )
  expect(html).toContain('"@type": "WebSite"')
  expect(html).toContain('"name": "MTG Battle Arena"')
  expect(html).toContain("<h1>MTG Battle Arena</h1>")
  expect(compactHtml).toMatch(
    /<noscript(?: [^>]*)?>.*data-nosnippet(?:="")?.*MTG Battle Arena.*<\/noscript>/,
  )
  expect(html).toContain('window.location.pathname !== "/"')
  expect(html).toContain('"noindex, follow"')

  const jsonLd =
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1]
  expect(jsonLd).toBeDefined()
  expect(JSON.parse(jsonLd!)).toEqual({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MTG Battle Arena",
    url: "https://mtgbattlearena.nl/",
  })
  expect(html).not.toContain("MTG Battle Mode")
})

test("robots en sitemap zijn echte publieke statische assets", () => {
  expect(read("../public/robots.txt")).toBe(
    "User-agent: *\nAllow: /\nSitemap: https://mtgbattlearena.nl/sitemap.xml\n",
  )
  const sitemap = read("../public/sitemap.xml")
  expect(sitemap.match(/<url>/g)).toHaveLength(1)
  expect(sitemap).toContain("<loc>https://mtgbattlearena.nl/</loc>")
})
