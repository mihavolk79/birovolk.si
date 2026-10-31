// BIRO VOLK – gradnja spletne strani
// Prebere Notion (projekti z obkljukano »Objava na spletu«, aktivni citati) in Google Drive (fotografije),
// nato zapiše statično stran v mapo dist/.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const h10 = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PROJECTS_DB = process.env.NOTION_PROJECTS_DB || '766cf9b141b249c8a67eb92408047388';
const QUOTES_DB = process.env.NOTION_QUOTES_DB || 'a1598bf42e0a4e2f8644138dd26778d9';
const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID || '1ncQU3fN47q5cHcjcN3zHlc1XflDw8AlA';
const GOOGLE_SA = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
const DIST = 'dist';

const readJson = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
const txt = (p) => (p?.rich_text || p?.title || []).map(t => t.plain_text).join('').trim();

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
    const photos = [];
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
      await sharp(Buffer.from(r.data)).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(DIST, out));
      photos.push(out);
    }
    if (photos.length) result[num] = { photos, author };
  }
  return result;
}

async function main() {
  const site = await readJson('content/site.json');
  const overrides = await readJson('content/projects-overrides.json');
  const old = await readJson('content/projects-2007-2018.json');
  const featured = await readJson('content/featured.json');
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  const status = await readJson('content/projects-status.json').catch(() => ({}));
  let projects = [], quotes = site.quotes_fallback;
  const featuredNums = new Set(); // projekti z obkljukanim »Izbrano na naslovnici« v Notionu
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
      if (p['Izbrano na naslovnici']?.checkbox) featuredNums.add(num);
      if (!p['Objava na spletu']?.checkbox) continue;
      const o = ov || {};
      // Ob povezavi samo po številki (naziv v Notionu je bil spremenjen) velja novi naziv iz Notiona.
      const sl = txt(p['Javni naziv']) || (overrides[key] ? o.sl : naziv) || naziv;
      projects.push({ num, y: num.slice(0, 4), sl, en: txt(p['Javni naziv EN']) || o.en || sl, inv: o.inv || '', place: o.place || '', cat: o.cat || 'other', done: !!p['Zaključeno']?.checkbox });
    }
    const q = await notionQuery(QUOTES_DB, { property: 'Aktiven', checkbox: { equals: true } });
    const qs = q.map(r => [txt(r.properties['Citat']), [txt(r.properties['Avtor']), txt(r.properties['Vir']), txt(r.properties['Leto'])].filter(Boolean).join(', ')]).filter(x => x[0]);
    if (qs.length) quotes = qs;
  } else {
    // Brez Notiona ne vemo, kaj je obkljukano za objavo – zato se ne objavi noben projekt 2019–2026.
    console.log('NOTION_TOKEN ni nastavljen – projekti 2019–2026 niso objavljeni (ni podatka o »Objava na spletu«).');
  }
  projects.sort((a, b) => b.num.localeCompare(a.num));
  const photos = await drivePhotos();
  for (const p of projects) if (photos[p.num]) Object.assign(p, photos[p.num]);
  const published = new Set(projects.map(p => p.num));
  // Izbrani projekti na prvi strani = objavljeni + obkljukano »Izbrano na naslovnici« v Notionu.
  // Besedilo iz content/featured.json, če ima projekt tam vnos (vrstni red po featured.json), sicer samodejno iz podatkov projekta.
  const featuredOut = [
    ...featured.filter(f => featuredNums.has(f.num)),
    ...projects.filter(p => featuredNums.has(p.num) && !featured.some(f => f.num === p.num)).map(p => ({
      num: p.num, sl: p.sl, en: p.en,
      type_sl: site.cats.sl[p.cat] || '', type_en: site.cats.en[p.cat] || '',
      place_sl: [p.place, p.done ? '' : 'v teku'].filter(Boolean).join(' · '),
      place_en: [p.place, p.done ? '' : 'in progress'].filter(Boolean).join(' · ')
    }))
  ];
  const data = { site, projects, old, quotes, featured: featuredOut.filter(f => published.has(f.num)), updated: new Date().toISOString().slice(0, 10) };

  const tpl = await fs.readFile('src/index.html', 'utf8');
  await fs.writeFile(path.join(DIST, 'index.html'), tpl.replace('__DATA__', JSON.stringify(data)));
  await fs.mkdir(path.join(DIST, 'fonts'), { recursive: true });
  for (const [pkg, file] of [['barlow-condensed', 'latin-300'], ['barlow-condensed', 'latin-ext-300'], ['barlow-condensed', 'latin-400'], ['barlow-condensed', 'latin-ext-400'], ['barlow-condensed', 'latin-600'], ['barlow-condensed', 'latin-ext-600'], ['barlow-semi-condensed', 'latin-400'], ['barlow-semi-condensed', 'latin-ext-400'], ['barlow-semi-condensed', 'latin-500'], ['barlow-semi-condensed', 'latin-ext-500']]) {
    const f = `${pkg}-${file}-normal.woff2`;
    await fs.copyFile(`node_modules/@fontsource/${pkg}/files/${f}`, path.join(DIST, 'fonts', f));
  }
  try { await fs.copyFile('CNAME', path.join(DIST, 'CNAME')); } catch {}
  console.log(`Zgrajeno: ${projects.length} objavljenih projektov, ${Object.keys(photos).length} z fotografijami, ${quotes.length} citatov.`);
}
main().catch(e => { console.error(e); process.exit(1); });
