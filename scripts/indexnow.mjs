#!/usr/bin/env node
/**
 * Tell Bing, Yandex and Naver that the site changed, instead of waiting to be
 * crawled. Google does not take part; this is worth the twenty lines for the
 * German and Italian pages, where Bing carries a real share of the traffic.
 *
 * The key is not a secret. IndexNow proves ownership by having you serve the
 * key back from your own domain, which is why the file sits in public/ and is
 * committed like any other asset: anyone may read it, only this domain can
 * host it at that address.
 *
 * Run it after a deployment that changed content:
 *   npm run seo:indexnow
 *
 * URLs come from the built sitemap, so the list can never drift from what the
 * site actually publishes. Nothing here runs at build time on purpose: a
 * preview deployment must not announce itself, and pinging on every build
 * would cry wolf.
 */
const KEY = '626c816b98089adcdcfac44d2aab1cde';
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.obordeleau.fr';
const host = new URL(SITE).host;

const sitemap = await fetch(`${SITE}/sitemap.xml`);
if (!sitemap.ok) {
  console.error(`Sitemap unreachable at ${SITE}/sitemap.xml (${sitemap.status}).`);
  process.exit(1);
}

const urlList = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) {
  console.error('The sitemap lists no URL. Nothing submitted.');
  process.exit(1);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList,
  }),
});

// 200 and 202 both mean accepted; 202 says the key is still being verified.
if (!response.ok) {
  console.error(`IndexNow refused the submission: ${response.status} ${response.statusText}`);
  process.exit(1);
}

console.log(`Submitted ${urlList.length} URLs to IndexNow (${response.status}).`);
