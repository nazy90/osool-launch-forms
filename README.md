# OSOOL Launch Campaign & Film — registration forms

Two bilingual (Arabic / English) static forms for GitHub Pages. Results go to a Google Sheet.

| Form | Path | Notes |
|---|---|---|
| Crew | `crew/` | Core identity details + **required ID upload** (photo or PDF, up to 8 MB) |
| Guest | `guest/` | Same fields as the National Day guest form (arrival, pick-up / car, drink, food) |

Add `?lang=en` to a link to open it in English. Arabic is the default, and both pages have a language toggle.

## How results are stored

- Each submission appends a row to the **Crew** or **Guests** tab of your Google Sheet.
- Crew ID files are saved to a private Drive folder, **OSOOL Launch — Crew IDs**, in the account that deploys the script. The row holds the file's Drive link. Only you, and anyone you share the folder with, can open the files.
- Large phone photos are resized to 2000 px JPEG before upload.

## One-time setup (≈10 minutes)

1. **Create the Sheet.** Create a new Google Sheet, e.g. "OSOOL Launch — Registrations".
2. **Add the script.** In the Sheet, go to **Extensions → Apps Script**. Delete the starter code and paste in `apps-script/Code.gs`. Save.
3. **Authorise.** In the function dropdown, select `setup` and click **Run**. Approve the Sheets + Drive permissions. This creates the *Crew* and *Guests* tabs and the Drive folder.
4. **Deploy.** Go to **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Copy the **Web app URL**. It ends in `/exec`.
5. **Connect the forms.** Paste that URL into `assets/config.js` as `SCRIPT_URL`.
6. **Push.** Commit and push `assets/config.js`. GitHub Pages redeploys in about a minute. The live links are:
   - Crew: https://nazy90.github.io/osool-launch-forms/crew/
   - Guest: https://nazy90.github.io/osool-launch-forms/guest/

If you change `Code.gs` later, go to **Deploy → Manage deployments → Edit → Version: New version**. This keeps the same URL.

## Before sharing

- Replace the `[TBD]` placeholders (shoot date, location, call time, brief, team) in `assets/forms-data.js`.
- Send one test submission on each form and check the row and the Drive file.

## Notes

- The web-app URL is public, as with any open form. The script rejects unknown forms, missing required fields, non-image/PDF files, and files over 8 MB. It also includes a hidden honeypot field against bots.
- Sheet cells starting with `= + - @` are stored as text, so a submission can't inject formulas.
