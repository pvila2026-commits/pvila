/* Shared helpers — Panchanan Villa */
(function () {
  const C = window.PVILA;
  const DEMO = !C.apiUrl;
  const LS_KEY = "pv_demo_bookings";

  const inr = n => "₹" + Math.round(n).toLocaleString("en-IN");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const allSpaces = () => C.spaces.concat([C.wholeVilla]);
  const spaceById = id => allSpaces().find(s => s.id === id);
  const fmtDate = iso => { if (!iso) return ""; const d = new Date(iso + "T00:00:00"); return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); };
  const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

  /* Price calculation — mirrored in backend/Code.gs (server is the source of truth) */
  function quote(spaceIds, checkIn, checkOut) {
    let ids = spaceIds.slice();
    if (ids.includes("ALL") || C.spaces.every(s => ids.includes(s.id))) ids = ["ALL"];
    const days = Math.max(1, daysBetween(checkIn, checkOut) || 0);
    const perDay = ids.reduce((t, id) => t + (spaceById(id) ? spaceById(id).price : 0), 0);
    const subtotal = perDay * days;
    const total = subtotal;
    const payNow = Math.round(total * C.advancePercent / 100);
    return { ids, days, perDay, subtotal, total, payNow, balance: total - payNow };
  }

  /* --------- API (Google Apps Script) with demo fallback --------- */
  async function apiGet(params) {
    if (DEMO) return demoGet(params);
    const url = C.apiUrl + "?" + new URLSearchParams(params).toString();
    const r = await fetch(url, { method: "GET" });
    return r.json();
  }
  async function apiPost(body) {
    if (DEMO) return demoPost(body);
    const r = await fetch(C.apiUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
    return r.json();
  }

  function demoAll() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch (e) { return []; } }
  function demoSave(list) { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch (e) {} }
  function overlaps(a1, a2, b1, b2) { return a1 < b2 && b1 < a2; }
  function clash(list, ids, ci, co, ignoreId) {
    const want = ids.includes("ALL") ? C.spaces.map(s => s.id) : ids;
    for (const b of list) {
      if (b.id === ignoreId || b.status !== "PAID") continue;
      const have = b.spaces.includes("ALL") ? C.spaces.map(s => s.id) : b.spaces;
      if (overlaps(ci, co, b.checkIn, b.checkOut) && want.some(x => have.includes(x))) return true;
    }
    return false;
  }
  function demoGet(p) {
    const list = demoAll();
    if (p.action === "availability") {
      const busy = {};
      C.spaces.forEach(s => {
        busy[s.id] = list.some(b => b.status === "PAID" && overlaps(p.from, p.to, b.checkIn, b.checkOut) &&
          (b.spaces.includes("ALL") || b.spaces.includes(s.id)));
      });
      return Promise.resolve({ ok: true, busy });
    }
    if (p.action === "calendar") {
      return Promise.resolve({ ok: true, items: list.filter(b => b.status === "PAID" && b.checkIn < p.to && p.from < b.checkOut)
        .map(b => ({ checkIn: b.checkIn, checkOut: b.checkOut, spaces: b.spaces })) });
    }
    if (p.action === "status") {
      const b = list.find(x => x.id === p.id && x.token === p.t);
      return Promise.resolve(b ? { ok: true, booking: b } : { ok: false, error: "Booking not found" });
    }
    if (p.action === "list") return Promise.resolve({ ok: true, rows: list.slice().reverse() });
    return Promise.resolve({ ok: false, error: "Unknown action" });
  }
  function demoPost(body) {
    if (body.action !== "create") return Promise.resolve({ ok: false, error: "Unknown action" });
    const b = body.booking, list = demoAll();
    const q = quote(b.spaces, b.checkIn, b.checkOut);
    if (clash(list, q.ids, b.checkIn, b.checkOut)) return Promise.resolve({ ok: false, error: "Sorry — one or more selected spaces are already booked for these dates." });
    const d = new Date();
    const id = "PV-" + d.toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000);
    const rec = Object.assign({}, b, {
      id, token: Math.random().toString(36).slice(2, 12), spaces: q.ids, days: q.days,
      subtotal: q.subtotal, total: q.total, payNow: q.payNow, balance: q.balance,
      status: "PENDING", createdAt: d.toISOString(), txnid: id.replace(/-/g, ""), payuId: "", payMode: ""
    });
    list.push(rec); demoSave(list);
    return Promise.resolve({ ok: true, id, token: rec.token, demo: true, payNow: q.payNow });
  }
  function demoMarkPaid(id) {
    const list = demoAll(); const b = list.find(x => x.id === id);
    if (b) { b.status = "PAID"; b.payuId = "DEMO" + Date.now(); b.payMode = "DEMO"; b.paidAt = new Date().toISOString(); demoSave(list); }
  }

  /* --------- PayU redirect (params + hash come from the backend) --------- */
  function postToPayU(payu) {
    const f = document.createElement("form");
    f.method = "POST"; f.action = payu.action;
    Object.entries(payu.params).forEach(([k, v]) => {
      const i = document.createElement("input"); i.type = "hidden"; i.name = k; i.value = v; f.appendChild(i);
    });
    document.body.appendChild(f); f.submit();
  }

  /* --------- Acknowledgement text (WhatsApp / email) --------- */
  function ackText(b) {
    const names = b.spaces.map(id => (spaceById(id) || { short: id }).short).join(", ");
    return [
      "*PANCHANAN VILLA — Booking Acknowledgement*",
      "Booking ID: *" + b.id + "*",
      "Status: " + (b.status === "PAID" ? "CONFIRMED (Payment received)" : b.status),
      "",
      "Guest: " + b.name + " (" + b.phone + ")",
      "Email: " + b.email,
      "Spaces: " + names,
      "Check-in: " + fmtDate(b.checkIn) + ", " + C.checkIn,
      "Check-out: " + fmtDate(b.checkOut) + ", " + C.checkOut,
      "Days: " + b.days + " | Guests: " + b.guests + " | Purpose: " + b.purpose,
      "",
      "Total tariff: " + inr(b.total) + " (" + inr(b.total / Math.max(1, b.days)) + "/day × " + b.days + ")",
      "Paid online: " + inr(b.status === "PAID" ? b.payNow : 0) + (b.payuId ? " (PayU ref " + b.payuId + ")" : ""),
      "Balance at check-in: " + inr(b.status === "PAID" ? b.balance : b.total),
      "Refundable security deposit at check-in: " + inr(C.securityDeposit),
      "",
      "House rules: No beef · No pork · Photo ID for all adults · Music till 10 PM · No drugs/gambling · No smoking indoors.",
      "Acknowledgement: " + C.domain + "/success.html?id=" + b.id + "&t=" + b.token,
      "Help: " + C.phoneDisplay
    ].join("\n");
  }
  const waLink = (num, text) => "https://wa.me/" + num + (text ? "?text=" + encodeURIComponent(text) : "");

  /* Wire generic WhatsApp / mail links on every page */
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".js-wa").forEach(a => { a.href = waLink(C.whatsapp, "Hello Panchanan Villa, I would like to enquire about a booking."); a.target = "_blank"; a.rel = "noopener"; });
    document.querySelectorAll(".js-mail").forEach(a => { a.href = "mailto:" + C.email; a.textContent = C.email; });
    const soc = document.getElementById("social");
    if (soc) soc.innerHTML =
      `<a class="soc soc-wa js-wa" href="${waLink(C.whatsapp, "Hello Panchanan Villa, I would like to enquire about a booking.")}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg viewBox="0 0 32 32"><path fill="currentColor" d="M16 3a13 13 0 0 0-11.2 19.6L3 29l6.6-1.7A13 13 0 1 0 16 3zm0 23.7c-2 0-4-.6-5.7-1.6l-.4-.2-3.9 1 1-3.8-.3-.4A10.7 10.7 0 1 1 16 26.7zm5.9-8c-.3-.2-1.9-1-2.2-1.1-.3-.1-.5-.2-.7.2l-1 1.2c-.2.2-.4.2-.7.1a8.7 8.7 0 0 1-4.3-3.8c-.3-.5.3-.5 1-1.6.1-.2 0-.4 0-.5l-1-2.4c-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.1 1.1-1.1 2.7s1.2 3.2 1.3 3.4c.2.2 2.3 3.5 5.6 4.9 2.1.9 2.9 1 4 .8.6-.1 1.9-.8 2.2-1.5.3-.8.3-1.4.2-1.5l-.6-.3z"/></svg></a>` +
      `<a class="soc soc-fb" href="${C.facebook}" target="_blank" rel="noopener" aria-label="Facebook"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.5 1.6-1.5h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.4 0-4.1 1.5-4.1 4.2v2.3H7.5V14h2.7v8h3.3z"/></svg></a>` +
      `<a class="soc soc-ig" href="${C.instagram}" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 7.3A4.7 4.7 0 1 0 12 16.7 4.7 4.7 0 0 0 12 7.3zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0zM21.9 8.2c-.1-1.5-.4-2.9-1.5-4s-2.5-1.5-4-1.5C14.8 2.6 9.2 2.6 7.6 2.7c-1.5.1-2.9.4-4 1.5s-1.5 2.5-1.5 4c-.1 1.6-.1 7.2 0 8.8.1 1.5.4 2.9 1.5 4s2.5 1.5 4 1.5c1.6.1 7.2.1 8.8 0 1.5-.1 2.9-.4 4-1.5s1.5-2.5 1.5-4c.1-1.6.1-7.2 0-8.8zm-2 10.5a3.2 3.2 0 0 1-1.8 1.8c-1.3.5-4.3.4-5.7.4s-4.5.1-5.7-.4a3.2 3.2 0 0 1-1.8-1.8c-.5-1.3-.4-4.3-.4-5.7s-.1-4.5.4-5.7a3.2 3.2 0 0 1 1.8-1.8c1.3-.5 4.3-.4 5.7-.4s4.5-.1 5.7.4a3.2 3.2 0 0 1 1.8 1.8c.5 1.3.4 4.3.4 5.7s.1 4.5-.4 5.7z"/></svg></a>`;
    const y = document.getElementById("yr"); if (y) y.textContent = new Date().getFullYear();
  });

  window.PV = { C, DEMO, inr, esc, fmtDate, todayISO, addDays, daysBetween, spaceById, allSpaces, quote,
                apiGet, apiPost, postToPayU, ackText, waLink, demoMarkPaid, demoAll };
})();
