/**
 * BIRO VOLK – samodejna osvežitev spletne strani
 * Google Apps Script (script.google.com). Sprožilec: časovni, vsakih 15 minut -> funkcija preveri().
 * V Project Settings -> Script properties nastavi:
 *   GITHUB_TOKEN  – fine-grained token z dovoljenjem "Contents: Read and write" samo za repozitorij strani
 *   GITHUB_REPO   – mihavolk79/birovolk.si
 *   NOTION_TOKEN  – isti Notion integration token kot v GitHubu (neobvezno)
 */
const FOLDER_ID = '1ncQU3fN47q5cHcjcN3zHlc1XflDw8AlA';           // Splet – fotografije
const PROJECTS_DB = '766cf9b141b249c8a67eb92408047388';           // Baza projektov BIRO VOLK
const QUOTES_DB = 'a1598bf42e0a4e2f8644138dd26778d9';             // Citati – spletna stran

function preveri() {
  const props = PropertiesService.getScriptProperties();
  const last = new Date(Number(props.getProperty('LAST') || 0));
  const now = new Date();
  if (driveChanged_(DriveApp.getFolderById(FOLDER_ID), last) || notionChanged_(props.getProperty('NOTION_TOKEN'), last)) {
    sprozi_(props);
  }
  props.setProperty('LAST', String(now.getTime()));
}

function driveChanged_(folder, since) {
  const files = folder.getFiles();
  while (files.hasNext()) if (files.next().getLastUpdated() > since) return true;
  const subs = folder.getFolders();
  while (subs.hasNext()) {
    const f = subs.next();
    if (f.getLastUpdated() > since || driveChanged_(f, since)) return true;
  }
  return false;
}

function notionChanged_(token, since) {
  if (!token) return false;
  return [PROJECTS_DB, QUOTES_DB].some(function (db) {
    const r = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + db + '/query', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28' },
      payload: JSON.stringify({ page_size: 1, filter: { timestamp: 'last_edited_time', last_edited_time: { after: since.toISOString() } } })
    });
    return r.getResponseCode() === 200 && JSON.parse(r.getContentText()).results.length > 0;
  });
}

function sprozi_(props) {
  UrlFetchApp.fetch('https://api.github.com/repos/' + props.getProperty('GITHUB_REPO') + '/dispatches', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + props.getProperty('GITHUB_TOKEN'), Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ event_type: 'osvezi' })
  });
}
