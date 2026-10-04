/**
 * OSOOL Launch Campaign & Film — registration backend.
 *
 * Bound to the results Google Sheet (Extensions → Apps Script). Each POST from
 * the GitHub Pages forms appends one row to the "Crew" or "Guests" tab. Crew ID
 * files are saved to a private Drive folder and linked from the row.
 *
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 */

const ID_FOLDER_NAME = 'OSOOL Launch — Crew IDs';
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_ANSWER_LENGTH = 2000;
const FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];

// Column order per sheet tab. `file: true` columns hold a Drive link.
const FORMS = {
  crew: {
    sheet: 'Crew',
    columns: [
      { key: 'full_name', label: 'Full name', required: true },
      { key: 'role', label: 'Role / department', required: true },
      { key: 'nationality', label: 'Nationality', required: true },
      { key: 'id_number', label: 'ID / Iqama / passport no.', required: true },
      { key: 'mobile', label: 'Mobile', required: true },
      { key: 'email', label: 'Email', required: true },
      { key: 'id_file', label: 'ID file', required: true, file: true },
    ],
  },
  guest: {
    sheet: 'Guests',
    columns: [
      { key: 'visitor_type', label: 'Joining as', required: true },
      { key: 'full_name', label: 'Full name', required: true },
      { key: 'id_number', label: 'ID / passport no.', required: true },
      { key: 'mobile', label: 'Mobile', required: true },
      { key: 'email', label: 'Email' },
      { key: 'arrival', label: 'Arrival', required: true },
      { key: 'pickup_location', label: 'Pick-up location' },
      { key: 'plate_number', label: 'Plate number' },
      { key: 'car_type', label: 'Car type' },
      { key: 'drink', label: 'Drink', required: true },
      { key: 'food', label: 'Food', required: true },
      { key: 'special_requests', label: 'Notes / special requests' },
    ],
  },
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.website) return json({ ok: true }); // honeypot filled → bot, drop silently

    const form = FORMS[body.form];
    if (!form) throw new Error('Unknown form');
    const answers = body.answers || {};
    const files = body.files || {};

    const row = [new Date(), body.lang === 'en' ? 'EN' : 'AR'];
    const saved = [];
    try {
      for (const col of form.columns) {
        if (col.file) {
          const file = files[col.key];
          if (!file) {
            if (col.required) throw new Error('Missing ' + col.key);
            row.push('');
            continue;
          }
          const driveFile = saveFile(file, answers, col.key);
          saved.push(driveFile);
          row.push(driveFile.getUrl());
          continue;
        }
        const value = String(answers[col.key] || '').trim().slice(0, MAX_ANSWER_LENGTH);
        if (!value && col.required) throw new Error('Missing ' + col.key);
        // Leading = + - @ would be run as a formula by Sheets.
        row.push(/^[=+\-@]/.test(value) ? "'" + value : value);
      }
      appendRow(form, row);
    } catch (err) {
      saved.forEach(f => f.setTrashed(true)); // don't leave orphaned IDs behind
      throw err;
    }
    return json({ ok: true });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

/** Lets you open the web-app URL in a browser to check it is live. */
function doGet() {
  return json({ ok: true, status: 'OSOOL registration endpoint is running' });
}

function saveFile(file, answers, key) {
  if (FILE_TYPES.indexOf(file.mimeType) === -1) throw new Error('File type not allowed');
  const bytes = Utilities.base64Decode(file.data);
  if (bytes.length > MAX_FILE_BYTES) throw new Error('File too large');

  const ext = (String(file.name).match(/\.[A-Za-z0-9]{1,5}$/) || [''])[0].toLowerCase();
  const who = [answers.full_name, answers.id_number].filter(Boolean).join('_');
  const name = (who || 'crew').replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) + '_' + key + ext;
  return idFolder().createFile(Utilities.newBlob(bytes, file.mimeType, name));
}

function idFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ID_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted — recreate below */ }
  }
  const folder = DriveApp.createFolder(ID_FOLDER_NAME);
  props.setProperty('ID_FOLDER_ID', folder.getId());
  return folder;
}

function appendRow(form, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = ensureSheet(form);
    const target = sheet.getLastRow() + 1;
    // Format answer cells as plain text BEFORE writing, otherwise Sheets reads
    // values like "0532414582" as numbers and drops the leading zero.
    sheet.getRange(target, 2, 1, row.length - 1).setNumberFormat('@');
    sheet.getRange(target, 1, 1, row.length).setValues([row]);
  } finally {
    lock.releaseLock();
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/** The form's tab, created with a bold, frozen header row if missing. */
function ensureSheet(form) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(form.sheet) || ss.insertSheet(form.sheet);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Submitted at', 'Language'].concat(form.columns.map(c => c.label)));
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, form.columns.length + 2).setFontWeight('bold');
  }
  return sheet;
}

/** Run once from the editor to create both tabs and approve Drive/Sheets access. */
function setup() {
  Object.keys(FORMS).forEach(kind => ensureSheet(FORMS[kind]));
  idFolder();
}
