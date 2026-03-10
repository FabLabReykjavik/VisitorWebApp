# App Screenshot
![App Screenshot](/AppScreenshot.jpg)

# Fab Lab Visitor Web App — Ultra-TL;DR Setup

This is the shortest path for another lab to copy this repo and get their own instance running.

---

## 1) Copy the repo
- **Fork or clone** this repository.
- **Do not commit secrets.** `js/config.js` is already ignored via `.gitignore`.

---

## 2) Create your Google Sheet + Apps Script
1. Make a new Google Sheet with a tab named **`Sheet1`**.
2. In the Sheet, go to **Extensions → Apps Script** and paste your backend script.
3. Set these constants in the script:
   ```js
   const SHEET_NAME = 'Sheet1';
   const API_KEY = 'YOUR_SECRET';
   ```
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or “Anyone with the link”)
   - Copy the **Web app URL** (ends with `/exec`)

---

## 3) Set header row in the Sheet
Put this in **`Sheet1!A1:I1`**:
```
ts	server_received_ts	staff_id	event_id	seq	reason	notes	school	clock_unsynced
```

---

## 4) Create your local config (untracked)
Copy the template and fill in your values:
```bash
cp js/config.sample.js js/config.js
```
Edit **`js/config.js`**:
```js
const CONFIG = {
  APPS_SCRIPT_BASE: "https://script.google.com/macros/s/REPLACE_WITH_YOUR_EXEC_URL/exec",
  API_KEY: "REPLACE_WITH_YOUR_SECRET",
  REFRESH_MS: 60000,
  FLUSH_MS: 30000
};
```
> Keep `js/config.js` **out of git**.

---

## 5) Run locally
Serve the folder with any static server:
```bash
python3 -m http.server 5173
# then open http://localhost:5173
```

---

### Notes
- **Public dashboard?** Hide/disable the “Log a Visit” form and publish the static files (e.g., GitHub Pages). Keep write endpoints private or separately keyed.
- **Security:** Never commit `js/config.js`. Use strong API keys. Consider separate keys for read-only vs. write operations.
