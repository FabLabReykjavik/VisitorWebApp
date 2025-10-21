# Apps Script Backend

This script powers both the desktop app and web app.

## Files
- `visitor_logger.gs`: Paste into **Extensions → Apps Script** in your Google Sheet (tab `Sheet1`).

## Setup
1. Open your Sheet → **Extensions → Apps Script**.
2. Create a new script file and paste the contents of `visitor_logger.gs`.
3. In Apps Script, go to **Project Settings → Script properties → Add property**:
   - Key: `API_KEY`
   - Value: `<your-strong-secret>`
4. Deploy: **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** (or “Anyone with the link”)
   - Copy the `/exec` URL.

## Sheet header (A1..I1)
ts server_received_ts staff_id event_id seq reason notes school clock_unsynced

## Notes
- Do **not** hardcode secrets in the script.
- The desktop app uses `POST` and `GET ?op=weekly`.
- The web app uses `GET ?op=summary` and `GET ?op=meta`, plus `POST` for logging.