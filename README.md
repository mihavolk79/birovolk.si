# Spletna stran BIRO VOLK

Statična stran, ki se zgradi iz Notiona (projekti, citati) in Google Drive (fotografije) ter objavi na GitHub Pages.

## Kako deluje
- **Projekti:** prikažejo se samo projekti z obkljukanim poljem *Objava na spletu* v »Baza projektov BIRO VOLK« (brez Notion žetona se ne prikaže noben projekt 2019–2026).
  Javni naziv, investitor, kraj in sklop so za obstoječe projekte v `content/projects-overrides.json` (repozitorij je javen – vanj ne vpisuj zasebnih naročnikov).
  Za nove projekte se uporabi *Naziv gradnje* iz Notiona, zato naj bo ta primeren za objavo (brez imen fizičnih oseb in naslovov).
- **Projekti 2007–2018:** tudi iz Notiona (vrstice STARI-…), prikažejo se samo obkljukani za objavo.
- **Izbrani projekti na prvi strani:** v Notionu obkljukaj *Izbrano na naslovnici* (in *Objava na spletu*), vrstni red določi s poljem *Mesto na naslovnici* (1 = prvi; prazno = za oštevilčenimi). Število ni omejeno. Lepše besedilo (kratek naziv, opis) lahko določiš v `content/featured.json`; projekti brez vnosa tam dobijo besedilo samodejno.
- **Citati:** Notion baza »Citati – spletna stran BIRO VOLK«, samo *Aktiven*.
- **Fotografije:** Google Drive → Claude_Cowork → *Splet – fotografije* → podmapa s številko projekta (glej BERI_ME.txt).
  Ob gradnji se zmanjšajo, pretvorijo v WebP in odstranijo se metapodatki (tudi GPS).
- **Besedila** (storitve, biro, kontakt, novice): `content/site.json`.
- **Objava:** ob vsaki spremembi v repozitoriju, vsako noč in ob signalu iz `tools/osvezi.gs`.

## Postavitev – enkratno

### 1. GitHub
1. Ustvari račun na github.com (npr. organizacija ali uporabnik *birovolk*).
2. **New repository** → ime `birovolk-web` → **Public** (GitHub Pages na zasebnem repozitoriju zahteva plačljiv paket). Repozitorij ne vsebuje gesel ali osebnih podatkov.
3. **Add file → Upload files** → povleci vse datoteke iz te mape.
   Mapa `.github` je skrita; če se ne naloži, jo ustvari ročno: **Add file → Create new file**, ime `.github/workflows/deploy.yml`, prilepi vsebino.
4. **Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 2. Notion
1. Notion → Settings → Connections → *Develop or manage integrations* → **New integration** (interna, samo branje vsebine).
2. Kopiraj *Internal Integration Secret*.
3. V bazah »Baza projektov BIRO VOLK« in »Citati – spletna stran BIRO VOLK«: ··· → **Connections** → dodaj integracijo.
4. GitHub → repozitorij → **Settings → Secrets and variables → Actions → New repository secret**: `NOTION_TOKEN`.

### 3. Google Drive (fotografije)
1. console.cloud.google.com → nov projekt → omogoči **Google Drive API**.
2. **IAM & Admin → Service accounts → Create** → nato **Keys → Add key → JSON** (prenese se datoteka).
3. V Google Drive mapo *Splet – fotografije* deli z e-naslovom service accounta kot **Viewer**.
4. GitHub secret `GOOGLE_SERVICE_ACCOUNT_JSON` = celotna vsebina JSON datoteke.

### 4. Prvi zagon
GitHub → **Actions → Objava strani → Run workflow**. Po ~2 minutah je stran na `https://<uporabnik>.github.io/birovolk-web/`.

### 5. Domena
1. Odloči se za glavno domeno (npr. `www.birovolk.si`). V koren repozitorija dodaj datoteko `CNAME` z vsebino `www.birovolk.si`.
2. Settings → Pages → Custom domain → `www.birovolk.si` → po preverjanju vklopi **Enforce HTTPS**.
3. Pri registrarju domene (DNS) nastavi:
   - `www` → CNAME → `<uporabnik>.github.io`
   - `@` (koren) → A zapisi `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - **MX zapisov (e-pošta) NE spreminjaj.**
4. Drugo domeno (`.com`) preusmeri na glavno pri registrarju.
Pred spremembo DNS preveri trenutne IP naslove v dokumentaciji GitHub Pages.

### 6. Samodejna osvežitev (neobvezno)
1. GitHub → Settings (profil) → Developer settings → **Fine-grained tokens** → dostop samo do `birovolk.si`, dovoljenje *Contents: Read and write*.
2. script.google.com → nov projekt → prilepi `tools/osvezi.gs`.
3. Project Settings → Script properties: `GITHUB_TOKEN`, `GITHUB_REPO` (`mihavolk79/birovolk.si`), `NOTION_TOKEN`.
4. Triggers → Add trigger → funkcija `preveri`, časovni, vsakih 15 minut.
Stran se osveži v ~15–20 minutah po spremembi v Notionu ali nalaganju fotografij.

## Lokalni preizkus
```
npm install
NOTION_TOKEN=... node build.mjs
```
Rezultat je v mapi `dist/`.
