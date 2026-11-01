// BIRO VOLK – gradnja spletne strani
// Prebere Notion (projekti z obkljukano »Objava na spletu«, aktivni citati) in Google Drive (fotografije),
// nato zapiše statično stran v mapo dist/.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
const h10 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PROJECTS_DB = process.env.NOTION_PROJECTS_DB || '766cf9b141b249c8a67eb92408047388';
const QUOTES_DB = process.env.NOTION_QUOTES_DB || 'a1598bf42e0a4e2f8644138dd26778d9';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1ncQU3fN47q5cHcjcN3zHlc1XflDw8AlA';
const GOOGLE_SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const DIST = 'dist';
// Glavni naslov strani (za canonical, hreflang, sitemap): iz datoteke CNAME, sicer SITE_URL.
const siteUrl = async () => process.env.SITE_URL || `https://${(await fs.readFile('CNAME', 'utf8').catch(() => 'www.birovolk.si')).trim()}`;

// Strani: pogled (kot v src/index.html) × jezik -> pot
const PAGES = [
  { v: '', sl: '', en: 'en/' },
  { v: 'storitve', sl: 'storitve/', en: 'en/services/' },
  { v: 'projekti', sl: 'projekti/', en: 'en/projects/' },
  { v: 'biro', sl: 'biro/', en: 'en/studio/' },
  { v: 'kontakt', sl: 'kontakt/', en: 'en/contact/' }
];
const cut = (t, n = 158) => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= n) return t; const s = t.slice(0, n); return s.slice(0, s.lastIndexOf(' ')).replace(/[,;:–-]$/, '') + ' …'; };
const attr = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const jsonInScript = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

// Opisi strani za iskalnike (meta description)
function describe(site, v, lang, n) {
  const sl = lang === 'sl';
  if (v === '') return sl
    ? 'BIRO VOLK, arhitekturni biro Ljubljana: arhitektura in arhitekturno projektiranje, dovoljenja, investicijska dokumentacija in nadzor. Prenove javnih stavb od 2007.'
    : 'BIRO VOLK, architecture studio in Ljubljana: architecture and architectural design, permits, investment documents and supervision. Public buildings since 2007.';
  if (v === 'storitve') return cut(site['serv_' + lang].tLead);
  if (v === 'projekti') return sl ? `Projekti arhitekturnega biroja BIRO VOLK iz Ljubljane: ${n} objavljenih projektov z letom, investitorjem, krajem in sklopom.`
    : `Projects by BIRO VOLK, architecture studio in Ljubljana: ${n} published projects with year, client, location and category.`;
  if (v === 'biro') return cut(site['biro_' + lang].tP1);
  return sl ? 'Arhitekturni biro BIRO VOLK d.o.o., Kersnikova ulica 6, 1000 Ljubljana. info@birovolk.si, +386 41 842 899. Sestanki po dogovoru.'
    : 'Architecture studio BIRO VOLK d.o.o., Kersnikova ulica 6, 1000 Ljubljana, Slovenia. info@birovolk.si, +386 41 842 899. Meetings by appointment.';
}

// Strukturirani podatki (schema.org) o biroju – samo podatki, ki so že objavljeni na strani
function orgLd(url, site, lang, ogImage) {
  const legal = (site.kont_sl.billing.find(b => /firma/i.test(b.l)) || {}).v;
  return {
    '@context': 'https://schema.org', '@type': 'ProfessionalService', '@id': url + '/#biro',
    name: 'BIRO VOLK', ...(legal ? { legalName: legal } : {}),
    description: describe(site, '', lang), url: url + '/',
    ...(ogImage ? { image: url + '/' + ogImage } : {}),
    email: 'info@birovolk.si', telephone: '+386 41 842 899', foundingDate: '2007',
    address: { '@type': 'PostalAddress', streetAddress: 'Kersnikova ulica 6', postalCode: '1000', addressLocality: 'Ljubljana', addressCountry: 'SI' },
    founder: { '@type': 'Person', name: 'Miha Volk', jobTitle: site['biro_' + lang].tRole1 },
    sameAs: ['https://www.instagram.com/birovolk/'],
    knowsLanguage: ['sl', 'en'],
    slogan: lang === 'sl' ? 'Arhitekturni biro Ljubljana' : 'Architecture studio Ljubljana',
    alternateName: lang === 'sl' ? 'BIRO VOLK – arhitekturni biro' : 'BIRO VOLK – architecture studio',
    ...(site.seo ? {
      knowsAbout: site.seo.knowsAbout[lang],
      areaServed: Object.entries(site.seo.areaServed).map(([code, nm]) => ({ '@type': 'Country', name: nm[lang === 'en' ? 1 : 0], identifier: code }))
    } : {})
  };
}

// Vsebino strani izriše ista koda kot v brskalniku (skripta iz src/index.html), le z nadomestnim »DOM«.
// Tako iskalnik dobi celotno besedilo že v HTML, brskalnik pa ga ob nalaganju izriše enako.
function prerender(script, data, page) {
  const els = {};
  const el = () => ({ innerHTML: '', attrs: {}, style: { setProperty() {} }, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    setAttribute(k, v) { this.attrs[k] = String(v); }, querySelector: () => null, querySelectorAll: () => [], focus() {}, contains: () => false });
  const document = { title: '', documentElement: { dataset: {}, lang: '' }, body: { style: {}, contains: () => false },
    getElementById: (id) => (els['#' + id] ||= el()), querySelector: (q) => (els[q] ||= el()), querySelectorAll: () => [], addEventListener() {}, baseURI: '' };
  const ctx = { document, location: { hash: '', pathname: '/' }, history: { pushState() {}, replaceState() {} }, addEventListener() {}, scrollTo() {} };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script.replace('__DATA__', jsonInScript(data)).replace('__PAGE__', jsonInScript(page)), ctx, { timeout: 5000 });
  return { title: document.title, nav: els['#nav'].innerHTML, main: els['#main'].innerHTML, foot: els['#foot'].innerHTML };
}

const readJson = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
const txt = (p) => (p?.rich_text || p?.title || []).map(t => t.plain_text).join('').trim();
// Leto iz številke projekta (LLLL-NNN ali STARI-LLLL-…)
// kraj + oznaka države (ISO): »Murska Sobota, SI«; »Austria« -> »AT«
const plc = (pl) => !pl || pl === '—' ? '' : pl === 'Austria' ? 'AT' : `${pl}, ${({ Liezen: 'AT', Wolfsberg: 'AT' })[pl] || 'SI'}`;
const yearOf = (num) => (String(num).match(/(?:19|20)\d{2}/) || [''])[0];

async function notionQuery(db, filter) {
  const out = []; let cursor;
  do {
    const r = await fetch(`https://api.notion.com/v1/databases/${db}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter, start_cursor: cursor, page_size: 100 })
    });
    if (!r.ok) throw new Error(`Notion ${r.status}: ${await r.text()}`);
    const j = await r.json(); out.push(...j.results); cursor = j.has_more ? j.next_cursor : undefined;
  } while (cursor);
  return out;
}

async function drivePhotos() {
  if (!GOOGLE_SA && !process.env.GOOGLE_APPLICATION_CREDENTIALS) { console.log('Google Drive: ni poverilnic, fotografije preskočene.'); return {}; }
  const { google } = await import('googleapis');
  const sharp = (await import('sharp')).default;
  const auth = new google.auth.GoogleAuth({ ...(GOOGLE_SA ? { credentials: JSON.parse(GOOGLE_SA) } : {}), scopes: ['https://www.googleapis.com/auth/drive.readonly'] });
  const drive = google.drive({ version: 'v3', auth });
  const list = async (q) => (await drive.files.list({ q, fields: 'files(id,name,mimeType)', supportsAllDrives: true, includeItemsFromAllDrives: true, pageSize: 1000 })).data.files;
  const result = {};
  for (const folder of await list(`'${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)) {
    const num = folder.name.trim();
    const files = (await list(`'${folder.id}' in parents and trashed=false`)).sort((a, b) => a.name.localeCompare(b.name));
    let author = '';
    const photos = [], dims = [];
    for (const f of files) {
      if (f.name.toLowerCase() === 'avtor.txt') {
        const r = await drive.files.get({ fileId: f.id, alt: 'media', supportsAllDrives: true }, { responseType: 'text' });
        author = String(r.data).trim(); continue;
      }
      if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(f.mimeType)) continue;
      const r = await drive.files.get({ fileId: f.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      const out = `img/${num}/${String(photos.length + 1).padStart(2, '0')}.webp`;
      await fs.mkdir(path.join(DIST, 'img', num), { recursive: true });
      // sharp privzeto ne prenese metapodatkov (EXIF, GPS) v izhodno datoteko
      const toWebp = (b) => sharp(b).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(DIST, out));
      let info;
      try { info = await toWebp(Buffer.from(r.data)); }
      catch (e) {
        try {
          // HEIC/HEIF (iPhone): sharp jih ne zna prebrati, zato jih najprej pretvorimo v JPEG
          if (!/hei[cf]/i.test(f.mimeType + f.name)) throw e;
          const heic = (await import('heic-convert')).default;
          info = await toWebp(Buffer.from(await heic({ buffer: Buffer.from(r.data), format: 'JPEG', quality: 0.92 })));
        } catch (e2) { console.log(`Fotografija preskočena (${num}/${f.name}): ${e2.message.split('\n')[0]}`); continue; } // ena slaba datoteka ne ustavi strani
      }
      photos.push(out); dims.push([info.width, info.height]); // mere za galerijo (postavitev brez skakanja)
    }
    if (photos.length) result[num] = { photos, author, dims };
  }
  return result;
}

async function main() {
  const site = await readJson('content/site.json');
  const overrides = await readJson('content/projects-overrides.json');
  const featured = await readJson('content/featured.json');
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const status = await readJson('content/projects-status.json').catch(() => ({}));
  let projects = [], quotes = site.quotes_fallback;
  const featuredPos = new Map(); // projekti z obkljukanim »Izbrano na naslovnici« -> »Mesto na naslovnici«
  // Javni seznam = SAMO projekti z obkljukano »Objava na spletu« v Notionu.
  // projects-overrides.json le dopolni javni naziv, investitorja, kraj in sklop za obkljukane projekte.
  if (NOTION_TOKEN) {
    const rows = await notionQuery(PROJECTS_DB, { property: 'Št. projekta', title: { is_not_empty: true } });
    for (const r of rows) {
      const p = r.properties;
      const num = txt(p['Št. projekta']); const naziv = txt(p['Naziv gradnje']);
      const key = `${num}|${h10(naziv)}`;
      // Povezava z overrides: najprej številka+naziv, sicer samo številka (če je pod to številko en sam vnos),
      // da preimenovanje v Notionu ne izgubi kraja, sklopa in angleškega naziva.
      const sameNum = Object.keys(overrides).filter(k => k.split('|')[0] === num);
      const ov = overrides[key] || (sameNum.length === 1 ? overrides[sameNum[0]] : undefined);
      if (p['Izbrano na naslovnici']?.checkbox) featuredPos.set(num, p['Mesto na naslovnici']?.number ?? Infinity);
      if (!p['Objava na spletu']?.checkbox) continue;
      const o = ov || {};
      // Ob povezavi samo po številki (naziv v Notionu je bil spremenjen) velja novi naziv iz Notiona.
      const sl = txt(p['Javni naziv']) || (overrides[key] ? o.sl : naziv) || naziv;
      // Investitor: »Investitor na spletu« (»-« = ne prikaži), sicer »Investitor« iz Notiona, sicer projects-overrides.json.
      const invWeb = txt(p['Investitor na spletu']);
      const inv = invWeb === '-' ? '' : (invWeb || txt(p['Investitor']) || o.inv || '');
      // Leto: »Leto zaključka« iz Notiona, sicer leto iz številke projekta.
      const yz = p['Leto zaključka']?.number;
      // naslov gradnje za povezavo na zemljevid: del pred »;« (brez parcel); samo pri projektih z investitorjem (zasebnost)
      const adr = (txt(p['Naslov gradnje']).split(';')[0] || '').trim();
      projects.push({ num, y: yz ? String(Math.round(yz)) : yearOf(num), sl, en: txt(p['Javni naziv EN']) || o.en || sl, inv, place: o.place || '', addr: inv && adr && !/parc|k\.o\./i.test(adr) ? adr : '', cat: o.cat || 'other', done: !!p['Zaključeno']?.checkbox });
    }
    const q = await notionQuery(QUOTES_DB, { property: 'Aktiven', checkbox: { equals: true } });
    const qs = q.map(r => [txt(r.properties['Citat']), [txt(r.properties['Avtor']), txt(r.properties['Vir']), txt(r.properties['Leto'])].filter(Boolean).join(', ')]).filter(x => x[0]);
    if (qs.length) quotes = qs;
  } else {
    // Brez Notiona ne vemo, kaj je obkljukano za objavo – zato se ne objavi noben projekt 2019–2026.
    console.log('NOTION_TOKEN ni nastavljen – projekti 2019–2026 niso objavljeni (ni podatka o »Objava na spletu«).');
  }
  // En kronološki seznam vseh objavljenih projektov (tudi STARI-…), najnovejši najprej.
  projects.sort((a, b) => b.y.localeCompare(a.y) || b.num.localeCompare(a.num));
  const old = []; // starejši projekti so v istem seznamu (polje ostaja zaradi združljivosti strani)
  const allPublished = projects;
  const photos = await drivePhotos();
  for (const p of projects) if (photos[p.num]) Object.assign(p, photos[p.num]);
  // Izbrani projekti na prvi strani = objavljeni + obkljukano »Izbrano na naslovnici« v Notionu; brez omejitve števila.
  // Vrstni red: »Mesto na naslovnici« (1, 2, 3 …), neoštevilčeni za njimi (novejši prej).
  // Besedilo iz content/featured.json, če ima projekt tam vnos, sicer samodejno iz podatkov projekta.
  const featuredOut = allPublished.filter(p => featuredPos.has(p.num))
    .sort((a, b) => (featuredPos.get(a.num) - featuredPos.get(b.num)) || b.num.localeCompare(a.num))
    .map(p => ({ // naziv, investitor, leto iz Notiona; kraj in sklop iz projects-overrides.json
      num: p.num, sl: p.sl, en: p.en, inv: p.inv,
      type_sl: site.cats.sl[p.cat] || '', type_en: site.cats.en[p.cat] || '',
      place_sl: [plc(p.place), p.done ? '' : 'v teku'].filter(Boolean).join(' · '),
      place_en: [plc(p.place), p.done ? '' : 'in progress'].filter(Boolean).join(' · ')
    }));
  const data = { site, projects, old, quotes, featured: featuredOut, updated: new Date().toISOString().slice(0, 10) };

  const tpl = await fs.readFile('src/index.html', 'utf8');
  const script = tpl.match(/<script>([\s\S]*)<\/script>/)[1];
  const URL0 = await siteUrl();
  const abs = (p) => `${URL0}/${p}`;

  // Slika za predogled ob deljenju (Open Graph): prva fotografija prvega izbranega projekta, sicer prvega s fotografijami
  let ogImage = '';
  const ogSrc = [...featuredOut.map(f => projects.find(p => p.num === f.num)), ...projects].find(p => p && p.photos && p.photos.length);
  if (ogSrc) {
    try {
      const sharp = (await import('sharp')).default;
      await sharp(path.join(DIST, ogSrc.photos[0])).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toFile(path.join(DIST, 'og.jpg'));
      ogImage = 'og.jpg';
    } catch (e) { console.log('og.jpg ni bila ustvarjena:', e.message); }
  }
  // Ikona strani: rdeča pika iz logotipa
  await fs.writeFile(path.join(DIST, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="8" fill="#d40000"/></svg>');
  try {
    const sharp = (await import('sharp')).default;
    await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" fill="#0a0a0a"/><circle cx="90" cy="90" r="30" fill="#d40000"/></svg>')).png().toFile(path.join(DIST, 'apple-touch-icon.png'));
  } catch (e) { console.log('apple-touch-icon ni bila ustvarjena:', e.message); }

  const n = projects.length;
  for (const pg of PAGES) for (const lang of ['sl', 'en']) {
    const rel = pg[lang], depth = rel.split('/').filter(Boolean).length;
    const r = prerender(script, data, { v: pg.v, lang });
    const desc = describe(site, pg.v, lang, n);
    const ld = [orgLd(URL0, site, lang, ogImage)];
    if (pg.v === '') ld.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'BIRO VOLK', url: URL0 + '/', inLanguage: lang, publisher: { '@id': URL0 + '/#biro' } });
    const head = [
      `<base href="${depth ? '../'.repeat(depth) : './'}">`,
      `<title>${attr(r.title)}</title>`,
      `<meta name="description" content="${attr(desc)}">`,
      `<link rel="canonical" href="${abs(rel)}">`,
      `<link rel="alternate" hreflang="sl" href="${abs(pg.sl)}">`,
      `<link rel="alternate" hreflang="en" href="${abs(pg.en)}">`,
      `<link rel="alternate" hreflang="x-default" href="${abs(pg.sl)}">`,
      `<link rel="icon" href="favicon.svg" type="image/svg+xml">`,
      `<link rel="apple-touch-icon" href="apple-touch-icon.png">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="BIRO VOLK">`,
      `<meta property="og:title" content="${attr(r.title)}">`,
      `<meta property="og:description" content="${attr(desc)}">`,
      `<meta property="og:url" content="${abs(rel)}">`,
      `<meta property="og:locale" content="${lang === 'sl' ? 'sl_SI' : 'en_GB'}">`,
      `<meta property="og:locale:alternate" content="${lang === 'sl' ? 'en_GB' : 'sl_SI'}">`,
      ...(ogImage ? [`<meta property="og:image" content="${abs(ogImage)}">`, `<meta property="og:image:width" content="1200">`, `<meta property="og:image:height" content="630">`, `<meta name="twitter:card" content="summary_large_image">`] : [`<meta name="twitter:card" content="summary">`]),
      ...ld.map(o => `<script type="application/ld+json">${jsonInScript(o)}</script>`)
    ].join('\n');
    const html = tpl
      .replace('<html lang="sl"', `<html lang="${lang}"`)
      .replace('__HEAD__', () => head)
      .replace('__HOME__', lang === 'sl' ? './' : 'en/')
      .replace('__LOGOLABEL__', lang === 'sl' ? 'BIRO VOLK, prva stran' : 'BIRO VOLK, home')
      .replace('__TAGLINE__', lang === 'sl' ? 'Arhitekturni biro Ljubljana' : 'Architecture studio Ljubljana')
      .replace('__MENULABEL__', lang === 'sl' ? 'Glavni meni' : 'Main menu')
      .replace('__NAV__', () => r.nav).replace('__MAIN__', () => r.main).replace('__FOOT__', () => r.foot)
      .replace('__DATA__', () => jsonInScript(data)).replace('__PAGE__', () => jsonInScript({ v: pg.v, lang }));
    await fs.mkdir(path.join(DIST, rel), { recursive: true });
    await fs.writeFile(path.join(DIST, rel, 'index.html'), html);
  }

  // Zemljevid strani za iskalnike (z obema jezikoma in fotografijami projektov)
  const today = data.updated;
  const imgs = projects.flatMap(p => (p.photos || []).map(src => ({ src, t: p.sl })));
  const sm = ['<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ...PAGES.flatMap(pg => ['sl', 'en'].map(lang => `<url><loc>${abs(pg[lang])}</loc><lastmod>${today}</lastmod>` +
      `<xhtml:link rel="alternate" hreflang="sl" href="${abs(pg.sl)}"/><xhtml:link rel="alternate" hreflang="en" href="${abs(pg.en)}"/><xhtml:link rel="alternate" hreflang="x-default" href="${abs(pg.sl)}"/>` +
      (pg.v === 'projekti' ? imgs.map(i => `<image:image><image:loc>${attr(abs(i.src))}</image:loc></image:image>`).join('') : '') + '</url>')),
    '</urlset>'].join('\n');
  await fs.writeFile(path.join(DIST, 'sitemap.xml'), sm);
  await fs.writeFile(path.join(DIST, 'llms.txt'), llmsTxt(site, projects, abs));
  await fs.writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);
  await fs.mkdir(path.join(DIST, 'fonts'), { recursive: true });
  for (const [pkg, file] of [['barlow-condensed', 'latin-300'], ['barlow-condensed', 'latin-ext-300'], ['barlow-condensed', 'latin-400'], ['barlow-condensed', 'latin-ext-400'], ['barlow-condensed', 'latin-600'], ['barlow-condensed', 'latin-ext-600'], ['barlow-semi-condensed', 'latin-400'], ['barlow-semi-condensed', 'latin-ext-400'], ['barlow-semi-condensed', 'latin-500'], ['barlow-semi-condensed', 'latin-ext-500']]) {
    const f = `${pkg}-${file}-normal.woff2`;
    await fs.copyFile(`node_modules/@fontsource/${pkg}/files/${f}`, path.join(DIST, 'fonts', f));
  }
  try { await fs.copyFile('CNAME', path.join(DIST, 'CNAME')); } catch {}
  console.log(`Zgrajeno (${PAGES.length * 2} strani, ${URL0}): ${projects.length} objavljenih projektov, ${data.featured.length} izbranih, ${Object.keys(photos).length} z fotografijami, ${quotes.length} citatov.`);
}
// llms.txt: povzetek biroja za AI orodja (samo besedila, ki so že objavljena na strani)
function llmsTxt(site, projects, abs) {
  const E = site.biro_en, B = site.biro_sl, C = site.cats.en;
  const svc = site.serv_en.groups.map(g => `### ${g.t}\n` + g.items.map(i => `- ${i.t}${i.d ? ': ' + i.d : ''}`).join('\n')).join('\n\n');
  const pl = (p) => p.place && p.place !== '—' ? p.place : '';
  const proj = projects.length ? projects.map(p => `- ${p.y} – ${p.en}${p.inv ? ' (client: ' + p.inv + ')' : ''}${pl(p) ? ', ' + pl(p) : ''}${C[p.cat] ? ' – ' + C[p.cat] : ''}`).join('\n') : '- see the projects page';
  const links = (lang) => PAGES.map(pg => `- [${lang === 'sl' ? ({ '': 'Prva stran', storitve: 'Storitve', projekti: 'Projekti', biro: 'Biro', kontakt: 'Kontakt' })[pg.v] : ({ '': 'Home', storitve: 'Services', projekti: 'Projects', biro: 'Studio', kontakt: 'Contact' })[pg.v]}](${abs(pg[lang])})`).join('\n');
  return `# BIRO VOLK – architecture studio, Ljubljana

> ${E.tP1}

${E.tP2}

- Address: Kersnikova ulica 6, SI-1000 Ljubljana, Slovenia
- E-mail: info@birovolk.si · Phone: +386 41 842 899
- Founded: 2007
- Areas of expertise: ${site.seo.knowsAbout.en.join(', ')}
- Countries: ${Object.values(site.seo.areaServed).map(n => n[1]).join(', ')}
- Languages: Slovenian, English
- Instagram: https://www.instagram.com/birovolk/

## Services

${svc}

## Published projects

${proj}

## Pages

${links('en')}

## Slovensko

> ${B.tP1}

${links('sl')}
`;
}

main().catch(e => { console.error(e); process.exit(1); });
