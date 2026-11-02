/* =====================================================================
   PANCHANAN VILLA — SITE CONFIGURATION
   Edit this one file to change prices, rules, contacts and backend URL.
   ===================================================================== */
window.PVILA = {
  siteName: "Panchanan Villa",
  domain: "https://pvila.in",
  whatsapp: "919831635374",          // country code + number, no "+"
  phoneDisplay: "+91 98316 35374",
  email: "bookings@pvila.in",        // shown on site; set OWNER_EMAIL in backend too
  address: "Panchanan Villa, West Bengal, India",

  /* Social pages — replace with the villa's real page links */
  facebook: "https://www.facebook.com/profile.php?id=61595773367574",
  instagram: "https://www.instagram.com/panchananvila/",

  /* Google Apps Script Web App URL (see README → Step 2).
     Leave empty to run the site in DEMO mode (bookings saved in browser only). */
  apiUrl: "",

  /* PayU: "test" uses https://test.payu.in, "live" uses https://secure.payu.in
     Merchant KEY and SALT are stored ONLY in the backend (never here). */
  payuMode: "test",

  /* ---------- TARIFF (₹ per day, 12 noon → 11 am next day) ---------- */
  securityDeposit: 10000,            // refundable, collected at check-in (not online)
  advancePercent: 100,               // % of total collected online (e.g. 30 for advance only)

  spaces: [
    { id: "GF",  name: "Ground Floor — Grand Lounge", short: "Ground Floor",
      price: 15000, guests: 60, img: "assets/img/villa-lobby.jpg",
      desc: "Double-height glass frontage, marble flooring and carved teak seating. Ideal for receptions, pujas and get-togethers." },
    { id: "F1",  name: "First Floor — Garden Suite", short: "First Floor",
      price: 18000, guests: 12, img: "assets/img/villa-terrace.jpg",
      desc: "Wraparound planter balcony, cove-lit ceilings and floor-to-ceiling windows. Rooms for a family stay." },
    { id: "F2",  name: "Second Floor — Sky Suite", short: "Second Floor",
      price: 18000, guests: 12, img: "assets/img/villa-floors.jpg",
      desc: "Bright, private top-floor suite with panoramic glazing and a quiet, sunlit lounge." },
    { id: "RT",  name: "Rooftop Terrace", short: "Rooftop",
      price: 12000, guests: 80, img: "assets/img/villa-roof.jpg",
      desc: "Open-sky terrace edged with jaali parapets and palms. Perfect for haldi, sangeet or a sunset dinner." }
  ],
  /* Whole-villa package (all 3 floors + roof) — discounted bundle */
  wholeVilla: { id: "ALL", name: "Entire Villa — 3 Floors + Rooftop", short: "Entire Villa",
                price: 55000, guests: 150, img: "assets/img/villa-front.jpg" },

  /* ---------- HOUSE RULES (shown in the entry disclaimer) ---------- */
  rules: [
    ["Strictly no beef", "Beef may not be brought in, cooked, served or consumed anywhere on the premises."],
    ["Strictly no pork", "Pork and pork products are not permitted on the premises."],
    ["Valid photo ID", "Government photo ID for every adult guest at check-in. Foreign nationals: passport & visa (Form C)."],
    ["Respect the sanctity", "This is a family home blessed with ॐ. Please maintain decorum; puja / havan only with prior intimation."],
    ["Music till 10 PM", "Loudspeakers / DJ are not permitted between 10 PM and 6 AM as per noise-pollution rules."],
    ["No drugs or gambling", "Narcotics, illegal substances and gambling are strictly prohibited. Booking will be cancelled without refund."],
    ["Alcohol by permission", "Alcohol only with prior approval, within your booked space, as per state excise rules."],
    ["No smoking indoors", "Smoking only in designated open areas. No firecrackers or sky lanterns anywhere, including the rooftop."],
    ["Guest count", "Visitors limited to the declared number of guests. Children must be supervised on the rooftop."],
    ["Pets & décor", "Pets only with prior permission. No nails, tape or open flames on walls; décor via approved vendors."],
    ["Damages", "Any damage or breakage will be adjusted from the refundable security deposit."],
    ["Cancellation", "7+ days before: 80% refund · 3–7 days: 50% · under 72 hours: no refund. Gateway charges non-refundable."]
  ],
  checkIn: "12:00 PM",
  checkOut: "11:00 AM"
};
