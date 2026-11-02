/* Bengali availability calendar — Panchanan Villa
   Bengali dates: West Bengal calendar (sankranti rule, Kolkata), 2026–2036 from bcal-data.js
   Floor dots: green = free, maroon = booked, grey = past                                    */
(function () {
  const { C, apiGet, todayISO, esc } = window.PV;
  const D = window.BCAL;
  const $ = id => document.getElementById(id);
  if (!D || !$("calGrid")) return;

  const BN_DIG = "০১২৩৪৫৬৭৮৯";
  const bn = n => String(n).replace(/\d/g, d => BN_DIG[d]);
  const BN_MONTH = ["বৈশাখ","জ্যৈষ্ঠ","আষাঢ়","শ্রাবণ","ভাদ্র","আশ্বিন","কার্তিক","অগ্রহায়ণ","পৌষ","মাঘ","ফাল্গুন","চৈত্র"];
  const BN_MONTH_EN = ["Baishakh","Jyoishtho","Asharh","Shrabon","Bhadro","Ashwin","Kartik","Agrahayan","Poush","Magh","Falgun","Choitro"];
  const BN_WEEK = ["রবি","সোম","মঙ্গল","বুধ","বৃহঃ","শুক্র","শনি"];
  const EN_WEEK = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const EN_MONTH = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const FLOORS = C.spaces.map(s => ({ id: s.id, label: { GF: "G", F1: "1", F2: "2", RT: "R" }[s.id] || s.id, name: s.short }));

  const set = arr => new Set(arr);
  const WED_PUB = set(D.wedPub), WED_CALC = set(D.wedCalc), PUR = set(D.purnima), AMA = set(D.amavasya), EKA = set(D.ekadashi);
  const MONTHS = D.months.map(m => ({ start: m[0], idx: m[1], year: m[2] }));
  const key = iso => iso.slice(2).replace(/-/g, "");
  const pad = n => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const nextISO = s => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

  function bengali(s) {
    let lo = 0, hi = MONTHS.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (MONTHS[mid].start <= s) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    if (k < 0) return null;
    const m = MONTHS[k];
    const day = Math.round((Date.parse(s) - Date.parse(m.start)) / 864e5) + 1;
    return { day, idx: m.idx, year: m.year };
  }

  const MIN = { y: 2026, m: 0 }, MAX = { y: 2036, m: 11 };
  const t0 = todayISO();
  let view = { y: +t0.slice(0, 4), m: +t0.slice(5, 7) - 1 };
  if (view.y < MIN.y) view = { ...MIN };
  if (view.y > MAX.y) view = { ...MAX };
  const cache = {};

  /* month / year jump */
  $("calMonth").innerHTML = EN_MONTH.map((n, i) => `<option value="${i}">${n}</option>`).join("");
  let yo = ""; for (let y = MIN.y; y <= MAX.y; y++) yo += `<option value="${y}">${y} · বঙ্গাব্দ ${bn(y - 594)}–${bn(y - 593)}</option>`;
  $("calYear").innerHTML = yo;

  $("calLegend").innerHTML =
    `<span class="lg"><i class="fd free"></i>Available</span><span class="lg"><i class="fd busy"></i>Booked</span>` +
    `<span class="lg lg-floors">Dots (left→right): ${FLOORS.map(f => `<span class="nw"><b>${f.label}</b> ${esc(f.name)}</span>`).join("")}</span>` +
    `<span class="lg"><i class="sw wed"></i>বিয়ের তারিখ (Wedding date)</span><span class="lg"><i class="sw wed est"></i>Indicative wedding date</span>` +
    `<span class="lg">○ পূর্ণিমা &nbsp;● অমাবস্যা &nbsp;✦ একাদশী</span>`;
  $("calNote").textContent = "Bengali dates follow the West Bengal panjika (sankranti rule, Kolkata). Wedding dates for 2026–27 are from published panjika lists; " +
    "2028–2036 are calculated indicative dates (permitted months, nakshatra and tithi). Please confirm the lagna with your purohit.";

  async function booked(y, m) {
    const k = y + "-" + m;
    if (cache[k]) return cache[k];
    const from = iso(y, m, 1), to = iso(m === 11 ? y + 1 : y, (m + 1) % 12, 1);
    try { const r = await apiGet({ action: "calendar", from, to }); cache[k] = (r && r.items) || []; }
    catch (e) { cache[k] = null; }
    return cache[k];
  }
  function busyOn(items, s) {
    const out = {};
    FLOORS.forEach(f => out[f.id] = false);
    (items || []).forEach(b => {
      if (b.checkIn <= s && s < b.checkOut) {
        const sp = Array.isArray(b.spaces) ? b.spaces : String(b.spaces).split(/[|,]/);
        (sp.includes("ALL") ? FLOORS.map(f => f.id) : sp).forEach(id => { if (id in out) out[id] = true; });
      }
    });
    return out;
  }

  async function render() {
    const { y, m } = view;
    $("calMonth").value = m; $("calYear").value = y;
    $("calPrev").disabled = y === MIN.y && m === MIN.m;
    $("calNext").disabled = y === MAX.y && m === MAX.m;
    const days = new Date(y, m + 1, 0).getDate(), first = new Date(y, m, 1).getDay();
    const b1 = bengali(iso(y, m, 1)), b2 = bengali(iso(y, m, days));
    $("calEn").textContent = `${EN_MONTH[m]} ${y}`;
    $("calBn").textContent = b1.idx === b2.idx ? `${BN_MONTH[b1.idx]} ${bn(b1.year)}`
      : `${BN_MONTH[b1.idx]}${b1.year !== b2.year ? " " + bn(b1.year) : ""} – ${BN_MONTH[b2.idx]} ${bn(b2.year)}`;

    const wedOnly = $("calWed").checked;
    const grid = $("calGrid");
    grid.classList.add("loading");
    const items = await booked(y, m);
    if (view.y !== y || view.m !== m) return; // user navigated away
    grid.classList.remove("loading");

    let h = EN_WEEK.map((w, i) => `<div class="cw${i === 0 ? " sun" : ""}">${w}<small>${BN_WEEK[i]}</small></div>`).join("");
    for (let i = 0; i < first; i++) h += `<div class="cd blank"></div>`;
    const weds = [];
    for (let d = 1; d <= days; d++) {
      const s = iso(y, m, d), k = key(s), b = bengali(s);
      const wed = WED_PUB.has(k) || WED_CALC.has(k), est = !WED_PUB.has(k) && WED_CALC.has(k);
      const past = s < t0, wd = (first + d - 1) % 7;
      const busy = busyOn(items, s);
      const nFree = FLOORS.filter(f => !busy[f.id]).length;
      const moon = PUR.has(k) ? `<span class="moon" title="Purnima">○</span>` : AMA.has(k) ? `<span class="moon" title="Amavasya">●</span>` : EKA.has(k) ? `<span class="moon" title="Ekadashi">✦</span>` : "";
      const bnLabel = b.day === 1 ? `${bn(1)} ${BN_MONTH[b.idx]}` : bn(b.day);
      const dots = FLOORS.map(f => `<i class="fd ${past ? "past" : busy[f.id] ? "busy" : "free"}" title="${esc(f.name)}: ${past ? "—" : busy[f.id] ? "Booked" : "Available"}"></i>`).join("");
      const cls = ["cd", wed ? "wed" : "", est ? "est" : "", past ? "past" : "", s === t0 ? "today" : "", wd === 0 ? "sun" : "", b.day === 1 ? "bfirst" : "", wedOnly && !wed ? "dim" : "", !past && nFree === 0 ? "full" : ""].filter(Boolean).join(" ");
      const tip = `${d} ${EN_MONTH[m]} ${y} · ${bn(b.day)} ${BN_MONTH[b.idx]} ${bn(b.year)} (${b.day} ${BN_MONTH_EN[b.idx]})${wed ? " · Wedding date" + (est ? " (indicative)" : "") : ""}${past ? "" : " · " + nFree + "/4 spaces free"}`;
      h += `<button class="${cls}" data-d="${s}" ${past ? "disabled" : ""} title="${esc(tip)}" aria-label="${esc(tip)}">
              <span class="cg">${d}</span>${moon}
              <span class="cb">${bnLabel}</span>
              ${wed ? `<span class="wtag">বিয়ে</span>` : ""}
              <span class="fds">${dots}</span>
            </button>`;
      if (wed && !past) weds.push({ s, d, b, nFree, est });
    }
    grid.innerHTML = h;

    $("calWedList").innerHTML = weds.length
      ? `<h3>বিয়ের তারিখ · Wedding dates in ${EN_MONTH[m]} ${y}</h3><div class="wchips">` +
        weds.map(w => `<button class="wchip${w.nFree ? "" : " full"}" data-d="${w.s}"><b>${w.d} ${EN_MONTH[m].slice(0, 3)}</b><span>${bn(w.b.day)} ${BN_MONTH[w.b.idx]}${w.est ? " *" : ""}</span><em>${w.nFree ? w.nFree + "/4 free" : "Fully booked"}</em></button>`).join("") +
        `</div>` + (weds.some(w => w.est) ? `<p class="cal-note">* indicative — confirm with panjika</p>` : "")
      : `<h3>No upcoming wedding dates in ${EN_MONTH[m]} ${y}</h3><p class="cal-note">Bhadra, Ashwin, Kartik, Poush and Chaitra traditionally have few or no Bengali wedding dates.</p>`;
    if (items === null) $("calWedList").insertAdjacentHTML("afterbegin", `<p class="cal-warn">Live availability could not be loaded — dots show all free. Please refresh.</p>`);
  }

  function pick(s) {
    const busy = busyOn(cache[view.y + "-" + view.m], s);
    const free = FLOORS.filter(f => !busy[f.id]);
    if (!free.length) { alert("All spaces are booked on this date. Please choose another date."); return; }
    const space = free.length === FLOORS.length ? "ALL" : free[0].id;
    if (window.PVBook) window.PVBook.pickDate(s, space);
  }
  document.addEventListener("click", e => {
    const c = e.target.closest("#calGrid .cd[data-d], #calWedList .wchip[data-d]");
    if (c && !c.disabled) pick(c.dataset.d);
  });
  const move = n => { let m = view.m + n, y = view.y; if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; } view = { y, m }; render(); };
  $("calPrev").addEventListener("click", () => move(-1));
  $("calNext").addEventListener("click", () => move(1));
  $("calMonth").addEventListener("change", e => { view.m = +e.target.value; render(); });
  $("calYear").addEventListener("change", e => { view.y = +e.target.value; render(); });
  $("calWed").addEventListener("change", render);
  render();
})();
