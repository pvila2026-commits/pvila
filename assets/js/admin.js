/* Admin reports — Panchanan Villa */
(function () {
  const { C, DEMO, inr, esc, apiGet, spaceById, todayISO, addDays, fmtDate } = window.PV;
  const $ = id => document.getElementById(id);
  const FLOORS = C.spaces;
  const WED = new Set(((window.BCAL || {}).wedPub || []).concat((window.BCAL || {}).wedCalc || []));
  const wedKey = iso => iso.slice(2).replace(/-/g, "");
  let rows = [], key = "", active = "bookings";

  const spaceNames = r => r.spaces.map(s => (spaceById(s) || { short: s }).short).join(", ");
  const expand = sp => sp.includes("ALL") ? FLOORS.map(f => f.id) : sp;
  const dt = v => String(v || "").replace("T", " ").slice(0, 16);
  const num = v => +v || 0;
  const eachDay = (a, b, fn) => { for (let d = a; d < b; d = addDays(d, 1)) fn(d); };

  /* ---------- report definitions: cols = [header, value(row), display?(row)] ---------- */
  const REPORTS = {
    bookings: {
      title: "All Bookings", desc: "Every booking matching the filters, with full guest and payment details.",
      data: () => filtered(),
      cols: [
        ["Booking ID", r => r.id], ["Created", r => dt(r.createdAt)], ["Status", r => r.status, r => `<span class="pill ${esc(r.status)}">${esc(r.status)}</span>`],
        ["Name", r => r.name], ["Phone", r => r.phone], ["Email", r => r.email], ["Spaces", spaceNames],
        ["Check-in", r => r.checkIn], ["Check-out", r => r.checkOut], ["Days", r => r.days], ["Guests", r => r.guests],
        ["Purpose", r => r.purpose], ["ID Type", r => r.idType], ["Total (₹)", r => num(r.total), r => inr(num(r.total))],
        ["Paid Online (₹)", r => r.status === "PAID" ? num(r.payNow) : 0, r => inr(r.status === "PAID" ? num(r.payNow) : 0)],
        ["Balance (₹)", r => num(r.balance), r => inr(num(r.balance))], ["Txn ID", r => r.txnid], ["PayU ID", r => r.payuId],
        ["Pay Mode", r => r.payMode], ["Paid At", r => dt(r.paidAt)], ["Address", r => r.address], ["Notes", r => r.notes]
      ]
    },
    guests: {
      title: "Guest Register", desc: "Confirmed guests with ID type — keep for check-in records and police / Form C register.",
      data: () => filtered().filter(r => r.status === "PAID").sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
      cols: [["Check-in", r => r.checkIn], ["Check-out", r => r.checkOut], ["Booking ID", r => r.id], ["Guest Name", r => r.name],
             ["Mobile", r => r.phone], ["Email", r => r.email], ["Address", r => r.address], ["Photo ID Type", r => r.idType],
             ["Guests", r => r.guests], ["Spaces", spaceNames], ["Purpose", r => r.purpose]]
    },
    monthly: {
      title: "Monthly Summary", desc: "Bookings, booked days and money collected by month of check-in.",
      data: () => {
        const m = {};
        filtered().forEach(r => {
          const k = r.checkIn.slice(0, 7);
          const o = m[k] || (m[k] = { month: k, bookings: 0, paid: 0, pending: 0, failed: 0, days: 0, guests: 0, value: 0, collected: 0 });
          o.bookings++;
          if (r.status === "PAID") { o.paid++; o.days += num(r.days); o.guests += num(r.guests); o.value += num(r.total); o.collected += num(r.payNow); }
          else if (r.status === "PENDING") o.pending++; else o.failed++;
        });
        return Object.values(m).sort((a, b) => a.month.localeCompare(b.month));
      },
      cols: [["Month", o => o.month, o => new Date(o.month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })],
             ["Bookings", o => o.bookings], ["Confirmed", o => o.paid], ["Pending", o => o.pending], ["Failed / Cancelled", o => o.failed],
             ["Booked Days", o => o.days], ["Guests", o => o.guests], ["Booking Value (₹)", o => o.value, o => inr(o.value)],
             ["Collected Online (₹)", o => o.collected, o => inr(o.collected)]],
      total: true
    },
    floors: {
      title: "Floor-wise Report", desc: "Booked days, occupancy and revenue share per space within the selected date range (Entire Villa bookings count on every floor; revenue split by tariff).",
      data: () => {
        const [from, to] = range();
        const totalDays = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 864e5));
        const sumPrice = FLOORS.reduce((t, f) => t + f.price, 0);
        const o = {}; FLOORS.forEach(f => o[f.id] = { id: f.id, name: f.name, days: 0, bookings: 0, revenue: 0 });
        paidRows().forEach(r => {
          const ids = expand(r.spaces);
          let nights = 0; eachDay(r.checkIn, r.checkOut, d => { if (d >= from && d < to) nights++; });
          if (!nights) return;
          const perDayRev = num(r.total) / Math.max(1, num(r.days));
          const base = ids.reduce((t, id) => t + (spaceById(id) || { price: 0 }).price, 0) || sumPrice;
          ids.forEach(id => { if (!o[id]) return; o[id].days += nights; o[id].bookings++; o[id].revenue += perDayRev * nights * (spaceById(id).price / base); });
        });
        const list = Object.values(o), exact = Math.round(list.reduce((t, x) => t + x.revenue, 0));
        list.forEach(x => x.revenue = Math.round(x.revenue));
        const diff = exact - list.reduce((t, x) => t + x.revenue, 0);
        if (diff) list.reduce((m, x) => x.revenue > m.revenue ? x : m, list[0]).revenue += diff;   // keep total exact
        return list.map(x => Object.assign(x, { occ: x.days / totalDays * 100, totalDays }));
      },
      cols: [["Space", x => x.name], ["Bookings", x => x.bookings], ["Booked Days", x => x.days], ["Days in Range", x => String(x.totalDays)],
             ["Occupancy %", x => x.occ.toFixed(1), x => `<span class="bar-cell"><i style="width:${Math.min(100, x.occ)}%"></i>${x.occ.toFixed(1)}%</span>`],
             ["Revenue Share (₹)", x => x.revenue, x => inr(x.revenue)]],
      total: true
    },
    daily: {
      title: "Daily Occupancy Register", desc: "Day-by-day status of every floor (night of the date). Shows who has booked each space.",
      data: () => {
        const [from, to] = range(true);
        const out = [], paid = paidRows();
        eachDay(from, to, d => {
          const row = { date: d, wed: WED.has(wedKey(d)) };
          FLOORS.forEach(f => {
            const b = paid.find(r => r.checkIn <= d && d < r.checkOut && expand(r.spaces).includes(f.id));
            row[f.id] = b ? b.id + " · " + b.name : "";
          });
          row.free = FLOORS.filter(f => !row[f.id]).length;
          out.push(row);
        });
        return out;
      },
      cols: () => [["Date", r => r.date, r => fmtDate(r.date) + (r.wed ? ' <span class="wtag">বিয়ে</span>' : "")],
                   ["Day", r => new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })],
                   ["Wedding Date", r => r.wed ? "Yes" : ""]]
        .concat(FLOORS.map(f => [f.short, r => r[f.id] || "Free", r => r[f.id] ? `<span class="occ">${esc(r[f.id])}</span>` : `<span class="free">Free</span>`]))
        .concat([["Free Spaces", r => r.free + "/" + FLOORS.length]])
    },
    weddings: {
      title: "Wedding-Date Demand", desc: "Bengali wedding dates in the range and how many spaces are already booked on each — useful for pricing and follow-ups.",
      data: () => {
        const [from, to] = range(true), paid = paidRows(), out = [];
        eachDay(from, to, d => {
          if (!WED.has(wedKey(d))) return;
          const bk = paid.filter(r => r.checkIn <= d && d < r.checkOut);
          const used = new Set(); bk.forEach(r => expand(r.spaces).forEach(s => used.add(s)));
          out.push({ date: d, booked: used.size, ids: bk.map(r => r.id + " (" + r.name + ")").join("; ") });
        });
        return out;
      },
      cols: [["Date", r => r.date, r => fmtDate(r.date)], ["Day", r => new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })],
             ["Spaces Booked", r => r.booked + "/" + FLOORS.length], ["Spaces Free", r => FLOORS.length - r.booked],
             ["Bookings", r => r.ids || "—"]]
    },
    payments: {
      title: "Pending & Failed Payments", desc: "Bookings that did not complete payment — follow up on WhatsApp or check the PayU dashboard.",
      data: () => filtered().filter(r => r.status !== "PAID"),
      cols: [["Booking ID", r => r.id], ["Created", r => dt(r.createdAt)], ["Status", r => r.status, r => `<span class="pill ${esc(r.status)}">${esc(r.status)}</span>`],
             ["Name", r => r.name], ["Phone", r => r.phone, r => `<a href="https://wa.me/91${esc(r.phone)}" target="_blank" rel="noopener">${esc(r.phone)}</a>`],
             ["Email", r => r.email], ["Check-in", r => r.checkIn], ["Spaces", spaceNames], ["Amount (₹)", r => num(r.payNow), r => inr(num(r.payNow))],
             ["Txn ID", r => r.txnid], ["Gateway Status", r => r.payuStatus || ""], ["Error", r => r.errorMsg || ""]]
    }
  };
  const TAB_LABELS = { bookings: "All Bookings", guests: "Guest Register", monthly: "Monthly", floors: "Floor-wise", daily: "Daily Occupancy", weddings: "Wedding Dates", payments: "Pending / Failed" };

  /* ---------- filters ---------- */
  function range(defaultWindow) {
    let from = $("fFrom").value, to = $("fTo").value;
    if (!from || !to) {
      const ds = rows.flatMap(r => [r.checkIn, r.checkOut]).filter(Boolean).sort();
      if (!from) from = defaultWindow ? todayISO() : (ds[0] || todayISO());
      if (!to) to = defaultWindow ? addDays(from, 90) : (ds[ds.length - 1] || addDays(from, 30));
    } else to = addDays(to, 1);
    if (Math.round((Date.parse(to) - Date.parse(from)) / 864e5) > 1100) to = addDays(from, 1100);
    return [from, to];
  }
  function filtered() {
    const s = $("fStatus").value, sp = $("fSpace").value, f = $("fFrom").value, t = $("fTo").value, q = $("fQ").value.trim().toLowerCase();
    return rows.filter(r => (!s || r.status === s) && (!f || r.checkOut > f) && (!t || r.checkIn <= t) &&
      (!sp || expand(r.spaces).includes(sp) || (sp === "ALL" && r.spaces.includes("ALL"))) &&
      (!q || [r.id, r.name, r.phone, r.email].join(" ").toLowerCase().includes(q)));
  }
  const paidRows = () => filtered().filter(r => r.status === "PAID");

  /* ---------- render ---------- */
  function kpis() {
    const list = filtered(), paid = list.filter(r => r.status === "PAID");
    const today = todayISO(), upcoming = paid.filter(r => r.checkOut > today).length;
    const pend = list.filter(r => r.status === "PENDING").length;
    $("kpis").innerHTML = [
      [list.length, "Bookings"], [paid.length, "Confirmed"], [inr(paid.reduce((a, r) => a + num(r.payNow), 0)), "Collected online"],
      [inr(paid.reduce((a, r) => a + num(r.balance), 0)), "Balance due"], [upcoming, "Upcoming stays"], [pend, "Pending payment"]
    ].map(k => `<div><b>${k[0]}</b><span>${k[1]}</span></div>`).join("");
  }
  function current() { const R = REPORTS[active]; return { R, cols: typeof R.cols === "function" ? R.cols() : R.cols, data: R.data() }; }
  function render() {
    kpis();
    $("tabs").innerHTML = Object.keys(REPORTS).map(k => `<button role="tab" class="${k === active ? "on" : ""}" data-tab="${k}">${TAB_LABELS[k]}</button>`).join("");
    const { R, cols, data } = current();
    $("repTitle").textContent = R.title;
    $("repDesc").textContent = R.desc;
    let h = "<thead><tr>" + cols.map(c => `<th>${esc(c[0])}</th>`).join("") + "</tr></thead><tbody>";
    h += data.length ? data.map(r => "<tr>" + cols.map(c => `<td>${c[2] ? c[2](r) : esc(c[1](r))}</td>`).join("") + "</tr>").join("")
                     : `<tr><td colspan="${cols.length}" class="empty">No records for these filters.</td></tr>`;
    if (R.total && data.length) h += "<tr class='tot'>" + cols.map((c, i) => {
      if (i === 0) return "<td>Total</td>";
      const vals = data.map(r => c[1](r));
      if (!vals.every(v => typeof v === "number")) return "<td></td>";
      const s = vals.reduce((a, b) => a + b, 0);
      return `<td>${/₹/.test(c[0]) ? inr(s) : s}</td>`;
    }).join("") + "</tr>";
    $("tbl").innerHTML = h + "</tbody>";
    $("admFoot").textContent = `${data.length} row(s) · generated ${new Date().toLocaleString("en-IN")}${DEMO ? " · DEMO MODE (browser data)" : ""}`;
  }

  /* ---------- CSV ---------- */
  function toCSV(cols, data) {
    const cell = v => { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return "﻿" + [cols.map(c => cell(c[0])).join(",")].concat(data.map(r => cols.map(c => cell(c[1](r))).join(","))).join("\r\n");
  }
  function download(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  const stamp = () => todayISO();
  function dlReport(k) {
    const prev = active; active = k; const { cols, data } = current(); active = prev;
    download(`pvila-${k}-${stamp()}.csv`, toCSV(cols, data));
  }

  /* ---------- load / login ---------- */
  async function load() {
    $("lerr").textContent = "";
    try {
      const r = await apiGet({ action: "list", key });
      if (!r.ok) throw new Error(r.error || "Access denied");
      rows = r.rows.map(x => Object.assign({}, x, { spaces: Array.isArray(x.spaces) ? x.spaces : String(x.spaces || "").split(/[,|]\s*/).filter(Boolean) }));
      try { sessionStorage.setItem("pv_admin", key); } catch (e) {}
      $("login").hidden = true; $("panel").hidden = false; $("logout").hidden = false; render();
    } catch (e) { $("lerr").textContent = e.message; $("login").hidden = false; $("panel").hidden = true; }
  }
  $("fSpace").innerHTML += FLOORS.map(f => `<option value="${f.id}">${esc(f.short)}</option>`).join("") + `<option value="ALL">Entire Villa bookings</option>`;
  $("go").addEventListener("click", () => { key = $("key").value.trim(); load(); });
  $("key").addEventListener("keydown", e => { if (e.key === "Enter") { key = $("key").value.trim(); load(); } });
  $("logout").addEventListener("click", () => { try { sessionStorage.removeItem("pv_admin"); } catch (e) {} location.reload(); });
  ["fStatus", "fSpace", "fFrom", "fTo", "fQ"].forEach(id => $(id).addEventListener("input", render));
  $("tabs").addEventListener("click", e => { const b = e.target.closest("[data-tab]"); if (b) { active = b.dataset.tab; render(); } });
  document.querySelector(".adm-quick").addEventListener("click", e => {
    const b = e.target.closest("[data-range]"); if (!b) return;
    const t = todayISO(), y = t.slice(0, 4);
    const R = { month: [t.slice(0, 8) + "01", ""], next90: [t, addDays(t, 90)],
                year: [y + "-01-01", y + "-12-31"], all: ["", ""] }[b.dataset.range];
    if (b.dataset.range === "month") { const d = new Date(+y, +t.slice(5, 7), 0); R[1] = `${y}-${t.slice(5, 7)}-${String(d.getDate()).padStart(2, "0")}`; }
    $("fFrom").value = R[0]; $("fTo").value = R[1]; render();
  });
  $("dlOne").addEventListener("click", () => dlReport(active));
  $("dlAll").addEventListener("click", () => Object.keys(REPORTS).forEach((k, i) => setTimeout(() => dlReport(k), i * 350)));
  $("print").addEventListener("click", () => window.print());
  $("reload").addEventListener("click", load);

  try { key = sessionStorage.getItem("pv_admin") || ""; } catch (e) {}
  if (DEMO) $("lerr").textContent = "Demo mode: any key works; shows bookings made in this browser.";
  if (key) load();
})();
