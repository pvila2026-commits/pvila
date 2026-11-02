/* Home page logic — Panchanan Villa */
(function () {
  const { C, DEMO, inr, esc, todayISO, addDays, daysBetween, spaceById, quote, apiGet, apiPost, postToPayU, demoMarkPaid } = window.PV;
  const $ = id => document.getElementById(id);
  const HL = [0, 1]; // highlight beef / pork rules

  /* ---------------- entry disclaimer ---------------- */
  const ruleLi = (r, i) => `<li class="${HL.includes(i) ? "hl" : ""}"><b>${esc(r[0])}</b><span>${esc(r[1])}</span></li>`;
  $("gateRules").innerHTML = C.rules.map(ruleLi).join("");
  let agreed = false;
  try { agreed = sessionStorage.getItem("pv_rules_ok") === "1"; } catch (e) {}
  if (!agreed) { $("gate").classList.add("show"); document.body.classList.add("locked"); }
  $("gateAgree").addEventListener("change", e => { $("gateBtn").disabled = !e.target.checked; });
  $("gateBtn").addEventListener("click", () => {
    try { sessionStorage.setItem("pv_rules_ok", "1"); } catch (e) {}
    $("gate").classList.remove("show"); document.body.classList.remove("locked");
    $("fAgree").checked = true; refresh();
  });

  /* ---------------- header ---------------- */
  const header = document.querySelector(".site-header");
  const onScroll = () => header.classList.toggle("fixed", window.scrollY > 120);
  window.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  $("menuBtn").addEventListener("click", () => $("nav").classList.toggle("open"));
  $("nav").addEventListener("click", e => { if (e.target.tagName === "A") $("nav").classList.remove("open"); });

  /* ---------------- slider (3rd slide pans) ---------------- */
  const slides = [...document.querySelectorAll(".slide")];
  let cur = 0, timer;
  $("dots").innerHTML = slides.map((_, i) => `<button aria-label="Slide ${i + 1}" class="${i ? "" : "on"}"></button>`).join("");
  const dots = [...$("dots").children];
  function go(n) {
    slides[cur].classList.remove("is-active"); dots[cur].classList.remove("on");
    cur = (n + slides.length) % slides.length;
    const s = slides[cur];
    if (s.classList.contains("slide-pan")) { s.style.animation = "none"; void s.offsetWidth; s.style.animation = ""; }
    s.classList.add("is-active"); dots[cur].classList.add("on");
    clearTimeout(timer); timer = setTimeout(() => go(cur + 1), s.classList.contains("slide-pan") ? 9000 : 5500);
  }
  dots.forEach((d, i) => d.addEventListener("click", () => go(i)));
  timer = setTimeout(() => go(1), 5500);

  /* ---------------- tariff cards (one row: 4 spaces + entire villa) ---------------- */
  const W = C.wholeVilla, sum4 = C.spaces.reduce((t, s) => t + s.price, 0);
  const W_DESC = "Exclusive use of the lounge, both suites and the rooftop — ideal for weddings and family functions.";
  $("spaceCards").innerHTML = C.spaces.concat([W]).map(s => {
    const all = s.id === "ALL";
    return `
    <article class="card${all ? " card-all" : ""}">
      <div class="card-img"><img src="${s.img}" alt="${esc(s.name)}" loading="lazy">${all ? '<span class="tag">Best value</span>' : ""}</div>
      <div class="card-body">
        <h3>${esc(s.name)}</h3>
        <p>${esc(all ? W_DESC : s.desc)}</p>
        <div class="meta"><span class="price">${all ? "<s>" + inr(sum4) + "</s>" : ""}${inr(s.price)} <small>/ day</small></span><span>Up to ${s.guests}</span></div>
        <button class="btn ${all ? "btn-white" : "btn-line"}" data-pick="${s.id}">${all ? "Book Entire Villa" : "Select &amp; Book"}</button>
      </div>
    </article>`; }).join("");
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-pick]"); if (!b) return;
    setSpaces([b.dataset.pick]); document.getElementById("book").scrollIntoView();
  });

  /* ---------------- default dates ---------------- */
  const t = todayISO();
  $("fIn").min = t; $("fIn").value = addDays(t, 1);
  $("fOut").min = addDays(t, 1); $("fOut").value = addDays(t, 2);

  /* ---------------- booking form ---------------- */
  $("spacePick").innerHTML = C.spaces.map(s => `
    <label data-id="${s.id}"><input type="checkbox" value="${s.id}"><span class="pn">${esc(s.short)}<small>up to ${s.guests} guests</small></span><span class="pp">${inr(s.price)}</span></label>`).join("") +
    `<label class="whole-opt" data-id="ALL"><input type="checkbox" value="ALL"><span class="pn">${esc(W.name)}<small>save ${inr(sum4 - W.price)} per day</small></span><span class="pp">${inr(W.price)}</span></label>`;
  const boxes = [...$("spacePick").querySelectorAll("input")];
  let busy = {};

  function selected() { return boxes.filter(b => b.checked).map(b => b.value); }
  function setSpaces(ids) { boxes.forEach(b => { b.checked = ids.includes(b.value); }); refresh(); }
  window.PVBook = {
    pickDate(iso, spaceId) {
      $("fIn").value = iso; $("fOut").min = addDays(iso, 1); $("fOut").value = addDays(iso, 1);
      if (spaceId) setSpaces([spaceId]);
      checkAvail(); document.getElementById("book").scrollIntoView();
    }
  };
  boxes.forEach(b => b.addEventListener("change", () => {
    if (b.value === "ALL" && b.checked) boxes.forEach(x => { if (x.value !== "ALL") x.checked = false; });
    if (b.value !== "ALL" && b.checked) boxes.find(x => x.value === "ALL").checked = false;
    const parts = boxes.filter(x => x.value !== "ALL");
    if (parts.every(x => x.checked)) { parts.forEach(x => x.checked = false); boxes.find(x => x.value === "ALL").checked = true; }
    refresh();
  }));

  function refresh() {
    boxes.forEach(b => {
      const id = b.value;
      const isBusy = id === "ALL" ? Object.values(busy).some(Boolean) : !!busy[id];
      const lab = b.closest("label");
      lab.classList.toggle("on", b.checked); lab.classList.toggle("off", isBusy);
      b.disabled = isBusy; if (isBusy) b.checked = false;
    });
    const ids = selected(), ci = $("fIn").value, co = $("fOut").value;
    const okDates = ci && co && daysBetween(ci, co) >= 1;
    const q = quote(ids, ci, co);
    const rows = [
      ["Check-in", okDates ? window.PV.fmtDate(ci) + ", " + C.checkIn : "—"],
      ["Check-out", okDates ? window.PV.fmtDate(co) + ", " + C.checkOut : "—"],
      ["Days", okDates ? q.days : "—"],
      ["Spaces", ids.length ? q.ids.map(i => spaceById(i).short).join(", ") : "—"],
      ["Tariff / day", inr(q.perDay)],
      ["Total", inr(q.total)]
    ];
    if (C.advancePercent < 100) rows.push(["Balance at check-in", inr(q.balance)]);
    $("sumList").innerHTML = rows.map(r => `<div><dt>${r[0]}</dt><dd>${r[1]}</dd></div>`).join("");
    $("sumPay").textContent = inr(ids.length && okDates ? q.payNow : 0);
    $("sumNote").textContent = `Refundable security deposit of ${inr(C.securityDeposit)} is collected at check-in.` +
      (C.advancePercent < 100 ? ` ${C.advancePercent}% advance is paid online now.` : "");
  }

  let availT;
  async function checkAvail() {
    const ci = $("fIn").value, co = $("fOut").value, m = $("availMsg");
    if (!ci || !co || daysBetween(ci, co) < 1) { m.className = "avail bad"; m.textContent = "Check-out must be after check-in."; busy = {}; refresh(); return; }
    m.className = "avail"; m.textContent = "Checking availability…";
    try {
      const r = await apiGet({ action: "availability", from: ci, to: co });
      busy = (r && r.busy) || {};
      const n = Object.values(busy).filter(Boolean).length;
      m.className = "avail " + (n ? "bad" : "ok");
      m.textContent = n ? `${n} space(s) already booked on these dates — greyed out below.` : "✓ All spaces are available for your dates.";
    } catch (e) { busy = {}; m.className = "avail"; m.textContent = "Could not check availability right now — it will be re-checked at payment."; }
    refresh();
  }
  $("fIn").addEventListener("change", () => { $("fOut").min = addDays($("fIn").value, 1); if ($("fOut").value <= $("fIn").value) $("fOut").value = addDays($("fIn").value, 1); clearTimeout(availT); availT = setTimeout(checkAvail, 250); });
  $("fOut").addEventListener("change", () => { clearTimeout(availT); availT = setTimeout(checkAvail, 250); });
  ["fGuests"].forEach(id => $(id).addEventListener("input", refresh));

  /* ---------------- pay ---------------- */
  if (DEMO) $("demoFlag").hidden = false;
  function validate() {
    const err = []; const mark = (id, bad) => $(id).classList.toggle("invalid", bad);
    const ci = $("fIn").value, co = $("fOut").value;
    if (!ci || !co || daysBetween(ci, co) < 1 || ci < todayISO()) { err.push("valid dates"); mark("fIn", true); mark("fOut", true); } else { mark("fIn", false); mark("fOut", false); }
    if (!selected().length) err.push("at least one space");
    const name = $("fName").value.trim(); mark("fName", name.length < 3); if (name.length < 3) err.push("your full name");
    const ph = $("fPhone").value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, ""); const pBad = !/^[6-9]\d{9}$/.test(ph); mark("fPhone", pBad); if (pBad) err.push("a 10-digit mobile number");
    const em = $("fEmail").value.trim(); const eBad = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em); mark("fEmail", eBad); if (eBad) err.push("a valid email");
    const g = +$("fGuests").value; const cap = quote(selected(), ci, co).ids.reduce((t, id) => t + spaceById(id).guests, 0);
    const gBad = !(g >= 1) || (cap && g > cap); mark("fGuests", gBad); if (gBad) err.push(cap ? `guests (max ${cap} for selected spaces)` : "number of guests");
    if (!$("fAgree").checked) err.push("agreement to the house rules");
    return { err, ph, name, em, g, ci, co };
  }
  $("payBtn").addEventListener("click", async () => {
    const v = validate(), out = $("formErr");
    if (v.err.length) { out.textContent = "Please provide " + v.err.join(", ") + "."; return; }
    out.textContent = "";
    const btn = $("payBtn"); btn.disabled = true; btn.textContent = "Processing…";
    const booking = {
      name: v.name, phone: v.ph, email: v.em, guests: v.g, checkIn: v.ci, checkOut: v.co,
      spaces: quote(selected(), v.ci, v.co).ids, purpose: $("fPurpose").value, idType: $("fIdType").value,
      address: $("fAddr").value.trim(), notes: $("fNote").value.trim(), rulesAccepted: true
    };
    try {
      const r = await apiPost({ action: "create", booking });
      if (!r.ok) throw new Error(r.error || "Booking could not be created.");
      try { localStorage.setItem("pv_last", JSON.stringify({ id: r.id, t: r.token })); } catch (e) {}
      const next = `success.html?id=${encodeURIComponent(r.id)}&t=${encodeURIComponent(r.token)}`;
      if (r.demo) {
        if (confirm(`DEMO MODE\n\nBooking ${r.id} created.\nSimulate a successful PayU payment of ${inr(r.payNow)}?`)) demoMarkPaid(r.id);
        location.href = next; return;
      }
      postToPayU(r.payu);
    } catch (e) {
      out.textContent = e.message || "Network error — please try again or WhatsApp us.";
      btn.disabled = false; btn.textContent = "Pay Securely with PayU";
      checkAvail();
    }
  });

  refresh(); checkAvail();
})();
