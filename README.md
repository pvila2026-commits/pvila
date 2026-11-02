# Panchanan Villa — pvila.in

Static booking website (GitHub Pages) + Google Sheets database + PayU payments + email/WhatsApp acknowledgement + CSV reports. No Render or paid server needed.

```
index.html          Home: disclaimer gate, short slider, tariff (1 row), Bengali calendar, booking + PayU
rules.html          House Rules & Disclaimer (separate page)
success.html        Acknowledgement (print/PDF, WhatsApp to guest & owner, email)
admin.html          Admin console: 7 reports (bookings, guest register, monthly, floor-wise, daily occupancy, wedding dates, pending/failed) — each downloadable as CSV
assets/js/config.js ← EDIT prices, rules, phone, email, Facebook/Instagram links, backend URL here
assets/js/calendar.js  Bengali availability calendar (floor-wise dots)
assets/js/bcal-data.js Bengali calendar data 2026–2036 (generated)
backend/Code.gs     Google Apps Script backend (database, PayU, emails, CSV)
CNAME               pvila.in
```

The site works immediately in **demo mode** (bookings stored in the browser, payment simulated) until Step 2 is done.

---

## Step 1 — Publish on GitHub Pages with pvila.in

1. Create a GitHub repository (e.g. `pvila`) and upload **all files in this folder** (keep the folder structure).
2. Repository → **Settings → Pages** → Source: *Deploy from a branch* → `main` / `root` → Save.
3. Custom domain: `pvila.in` (the `CNAME` file already contains it) → tick **Enforce HTTPS** once available.
4. At your domain registrar, add DNS records:

| Type | Host | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | `<your-github-username>.github.io` |

DNS can take up to 24 hours.

## Step 2 — Database + backend (Google Sheet, free)

1. Create a new Google Sheet named **PVILA Bookings** (use the villa's Google account — emails are sent from it).
2. **Extensions → Apps Script** → delete the sample code → paste all of `backend/Code.gs` → Save.
3. **Project Settings (⚙) → Script properties** → add:

| Property | Value |
|---|---|
| `PAYU_KEY` | Merchant Key from PayU dashboard |
| `PAYU_SALT` | Merchant Salt (v1) from PayU dashboard |
| `PAYU_MODE` | `test` (switch to `live` after testing) |
| `ADMIN_KEY` | a long password for admin.html |
| `OWNER_EMAIL` | email that should receive every booking |
| `SITE_URL` | `https://pvila.in` |
| `OWNER_WA` | `919831635374` |

   **PayU Key & Salt:** instead of typing them, use the separate **PAYU-SETUP.gs** file you received (not part of this repo): add it as a second script file, run `setupSecrets`, then delete that file. Run `checkSetup` to confirm — it shows MISSING for anything not yet set.
4. In the editor, choose function **setupTriggers** → **Run** → approve permissions. (Creates the *Bookings* tab and a 10-minute payment reconciliation job.)
5. **Deploy → New deployment → Web app** — Execute as: **Me**, Who has access: **Anyone** → Deploy → copy the **Web app URL** (ends in `/exec`).
6. Paste that URL into `assets/js/config.js` → `apiUrl: "https://script.google.com/macros/s/…/exec"` and push to GitHub.

> After editing Code.gs later: **Deploy → Manage deployments → Edit → Version: New version**, so the same URL keeps working.

## Step 3 — PayU

* Get a PayU (PayU Money / PayU Biz) merchant account; copy Key + Salt into Script properties.
* The Salt stays in Google — the website only receives the signed hash, so it cannot be tampered with.
* PayU success/failure return URLs point to the Apps Script, which verifies the reverse hash and amount, marks the booking **PAID**, sends emails, then sends the guest to `pvila.in/success.html`.
* If a guest closes the browser mid-payment, the 10-minute job asks PayU directly (`verify_payment`) and confirms the booking anyway.
* Test with PayU test cards in `test` mode, then set `PAYU_MODE` to `live`. Ask PayU to whitelist `pvila.in` if they request it.

## Acknowledgement delivery

| Channel | How |
|---|---|
| **Email — guest & owner** | Automatic, on confirmed payment (Gmail via Apps Script) |
| **WhatsApp — guest & owner** | One-tap buttons on the acknowledgement page with the full message pre-filled |
| **WhatsApp — fully automatic** *(optional)* | Add `WA_TOKEN`, `WA_PHONE_ID`, `WA_TEMPLATE` (WhatsApp Cloud API, approved template with 5 variables: name, booking ID, dates, amount, link). Meta charges per conversation. |

## Reports (CSV)

* Open `https://pvila.in/admin.html` (also linked as "Owner / Admin" in the footer) → enter `ADMIN_KEY`.
  Tabs: **All Bookings · Guest Register · Monthly · Floor-wise · Daily Occupancy · Wedding Dates · Pending / Failed**.
  Filter by stay dates, status, space or search; **Download this report** or **Download all reports** (one CSV each), or Print.
* Or:
* Direct: `<Web app URL>?action=csv&key=<ADMIN_KEY>`, or
* In the Google Sheet: File → Download → CSV.

## Changing prices or rules

Edit `assets/js/config.js` (website) **and** the `PRICES` / `CAPACITY` lines at the top of `backend/Code.gs` (the server recalculates every amount, so a changed browser price can't be paid).

Tariff currently set: Ground Floor ₹15,000 · First Floor ₹18,000 · Second Floor ₹18,000 · Rooftop ₹12,000 · Entire villa ₹55,000 per day (no GST added), ₹10,000 refundable deposit at check-in.

## Bengali availability calendar

* Covers **January 2026 – December 2036** (বঙ্গাব্দ ১৪৩২–১৪৪৩): Bengali date for every day, month changes, পূর্ণিমা / অমাবস্যা / একাদশী.
* Bengali dates follow the **West Bengal panjika rule** (solar sankranti, Kolkata). Checked against published calendars (e.g. Poila Baishakh 15 Apr 2026 & 15 Apr 2027; 17 Chaitra = 1 Apr 2027).
* **Wedding dates (বিয়ের তারিখ):** 2026–27 from published panjika lists; 2028–2036 are *indicative*, calculated from permitted months (Baishakh, Jyoishtho, Asharh, Agrahayan, Magh, Falgun), auspicious nakshatras and tithi. Shown with a lighter border and "*". When each year's new panjika is published, update `wedPub` in `bcal-data.js` (dates as `YYMMDD`).
* **Four dots per day** = Ground Floor · First Floor · Second Floor · Rooftop. Green = free, maroon = booked (paid, or payment in progress < 20 min). Booking the Entire Villa turns all four maroon. Tapping a date fills the booking form.
* The calendar reads only dates and floors from the backend (`?action=calendar`) — no guest details are exposed.

## Social links

Set `facebook` and `instagram` in `assets/js/config.js` to the villa's real pages. They appear with WhatsApp in the fixed bar on the left of every page.
