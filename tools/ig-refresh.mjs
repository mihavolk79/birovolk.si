// Osvežitev Instagram žetona (velja 60 dni; osvežiti ga je mogoče, ko je star vsaj 24 ur in še ni potekel).
// Teče v GitHub Actions pred gradnjo (samo pri nočnem zagonu):
//  1. pokliče graph.instagram.com/refresh_access_token,
//  2. nov žeton zapiše v datoteko INSTAGRAM_TOKEN_FILE (za gradnjo v istem zagonu),
//  3. z gh posodobi secret INSTAGRAM_TOKEN (potrebuje SECRETS_PAT: fine-grained token, samo ta repo, Secrets: Read and write).
// Žeton se nikoli ne izpiše; napaka ne ustavi gradnje.
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const IG_API = process.env.IG_API || 'https://graph.instagram.com';
const old = process.env.INSTAGRAM_TOKEN || '';
const file = process.env.INSTAGRAM_TOKEN_FILE;
const warn = (m) => console.log(`::warning::Instagram žeton: ${m}`);

if (!old) { console.log('Instagram žeton: ni nastavljen, osvežitev preskočena.'); process.exit(0); }
try {
  const r = await fetch(`${IG_API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(old)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { warn(`osvežitev ni uspela (${r.status}: ${j.error?.message || 'neveljaven odgovor'}). Če je potekel, ga ustvari znova v Meta App Dashboard.`); process.exit(0); }
  const tok = String(j.access_token);
  console.log(`::add-mask::${tok}`);
  const days = Math.round((Number(j.expires_in) || 0) / 86400);
  if (file) await fs.writeFile(file, tok, { mode: 0o600 });
  if (tok === old) { console.log(`Instagram žeton: podaljšan (${days} dni), niz enak – secret ostane.`); process.exit(0); }
  if (!process.env.GH_TOKEN) { warn('nov žeton prejet, a SECRETS_PAT ni nastavljen – secreta ni mogoče posodobiti.'); process.exit(0); }
  const g = spawnSync('gh', ['secret', 'set', 'INSTAGRAM_TOKEN', '--repo', process.env.GITHUB_REPOSITORY], { input: tok, encoding: 'utf8' });
  if (g.status !== 0) { warn(`secreta ni bilo mogoče posodobiti (gh: ${(g.stderr || '').split('\n')[0]}).`); process.exit(0); }
  console.log(`Instagram žeton: osvežen (${days} dni) in shranjen v secret.`);
} catch (e) { warn(`napaka (${e.message}).`); }
