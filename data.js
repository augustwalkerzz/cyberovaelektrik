// Birimler ve üyeler. Burayı düzenleyerek kişi ekleyip çıkarabilirsin.
export const UNITS = [
  { id: "haber", name: "Haberleşme", sub: "400 MHz · 900 MHz · 5 GHz topolojisi", m: ["Yiğit Kerem", "Doğukan"] },
  { id: "motor", name: "Fırçasız Motor Sürücü", sub: "BLDC sürücü", m: ["Sinan", "Eylül", "Kübra"] },
  { id: "bms", name: "BMS", sub: "Batarya yönetim sistemi", m: ["Bayram", "Oğuzhan", "Pelin"] },
  { id: "pdb", name: "Power Dist Board", sub: "48V · 24V · 19V · 12V · 7V · 5V PDN", m: ["Pelin"] },
  { id: "drone", name: "Drone", sub: "Drone elektroniği", m: ["Ali"] },
  { id: "yeni", name: "Yeni Katılanlar", sub: "Görev ataması bekleyenler",
    m: ["Alper", "Sıla", "Nisa", "Kerem", "Kadir", "Fatih Emre", "Elifnaz", "Fatih"] },
];

export const slug = n => n.toLowerCase().replace(/ı/g,"i").replace(/ş/g,"s").replace(/ğ/g,"g")
  .replace(/ü/g,"u").replace(/ö/g,"o").replace(/ç/g,"c").replace(/\s+/g,"-");

// slug -> { name, units: [...] }
export const PEOPLE = {};
UNITS.forEach(u => u.m.forEach(n => {
  const s = slug(n);
  (PEOPLE[s] = PEOPLE[s] || { name: n, units: [] }).units.push(u.id);
}));
export const unitOf = id => UNITS.find(u => u.id === id);
