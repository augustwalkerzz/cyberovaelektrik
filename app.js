import { auth, db, ADMIN_EMAIL } from "./firebase.js";
import { UNITS, PEOPLE, slug, unitOf } from "./data.js";
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, onSnapshot, query, where }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const $ = document.getElementById("app"), foot = document.getElementById("foot");
const S = { user: null, me: null, admin: false, tasks: [], anns: [], claims: [], people: [],
            tab: "panel", view: null, mode: "login", ready: false };
let unsubs = [];

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const ago = t => t ? new Date(t).toLocaleDateString("tr-TR", { day: "numeric", month: "long" }) : "";
const mine = s => S.tasks.filter(t => t.slug === s).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
const prog = s => { const t = mine(s); return { d: t.filter(x => x.done).length, n: t.length }; };
const code6 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

/* ---------- Veri dinleyicileri ---------- */
function stop() { unsubs.forEach(u => u()); unsubs = []; S.tasks = []; S.anns = []; S.claims = []; S.people = []; }
function watch(name, q, setter) {
  unsubs.push(onSnapshot(q, snap => { setter(snap.docs.map(d => ({ id: d.id, ...d.data() }))); render(); },
    () => { /* yetkisiz okuma sessizce yok sayılır */ }));
}
function watchAnns(targets) {
  const parts = {};
  targets.forEach(t => watch("ann", query(collection(db, "ann"), where("target", "==", t)), list => {
    parts[t] = list; S.anns = Object.values(parts).flat();
  }));
}

onAuthStateChanged(auth, async user => {
  stop(); S.user = user; S.me = null; S.view = null; S.tab = "panel"; S.ready = false;
  if (!user) { S.admin = false; S.ready = true; return render(); }
  S.admin = user.email === ADMIN_EMAIL;
  if (S.admin) {
    watch("t", collection(db, "tasks"), l => S.tasks = l);
    watch("a", collection(db, "ann"), l => S.anns = l);
    watch("c", collection(db, "claims"), l => S.claims = l);
    watch("p", collection(db, "people"), l => S.people = l);
  } else {
    const u = await getDoc(doc(db, "users", user.uid));
    S.me = u.exists() ? u.data().slug : null;
    if (S.me) {
      watch("t", query(collection(db, "tasks"), where("slug", "==", S.me)), l => S.tasks = l);
      watchAnns(["all", S.me, ...PEOPLE[S.me].units]);
    }
  }
  S.ready = true; render();
});

/* ---------- Görünümler ---------- */
function render() {
  foot.innerHTML = S.user ? "<a data-logout>Çıkış yap (" + esc(S.user.email) + ")</a>" : "";
  if (!S.ready) return;
  $.innerHTML = !S.user ? authView() : S.admin ? adminView() : S.me ? memberView(S.me)
    : '<div class="card">Hesabın var ama bir isimle eşleşmemiş. Kaptanla iletişime geç.</div>';
}

function authView() {
  const reg = S.mode === "register";
  const names = UNITS.map(u => '<optgroup label="' + esc(u.name) + '">' +
    u.m.map(n => '<option value="' + slug(n) + '">' + esc(n) + "</option>").join("") + "</optgroup>").join("");
  return '<div class="card"><div class="tabs"><button data-mode="login" class="' + (!reg ? "on" : "") + '">Giriş</button>' +
    '<button data-mode="register" class="' + (reg ? "on" : "") + '">İlk kayıt</button></div>' +
    '<form data-auth="' + S.mode + '">' +
    (reg ? '<select name="slug" required><option value="">Adını seç</option>' + names + "</select>" +
           '<input name="code" placeholder="Kaptanın verdiği davet kodu" required>' : "") +
    '<input name="email" type="email" placeholder="E-posta" required>' +
    '<input name="pw" type="password" placeholder="Şifre (en az 6 karakter)" minlength="6" required>' +
    '<button class="p">' + (reg ? "Kayıt ol" : "Giriş yap") + "</button></form>" +
    '<p class="mu" id="msg"></p></div>';
}

function taskHtml(t, own) {
  return '<div class="task' + (t.done ? " done" : "") + '"><input type="checkbox" data-tick="' + t.id + '" ' + (t.done ? "checked" : "") + ">" +
    '<div class="sp"><div class="t"><b>' + esc(t.title) + "</b></div>" + (t.desc ? '<div class="mu">' + esc(t.desc) + "</div>" : "") +
    '<div class="mu"><span class="chip">' + esc((unitOf(t.unit) || {}).name || "") + "</span> " +
    (t.due ? "Son tarih: " + esc(t.due) + " · " : "") + (t.done && t.doneAt ? "Tamamlandı: " + ago(t.doneAt) : "") + "</div></div>" +
    (own ? "" : '<button class="d" data-deltask="' + t.id + '">Sil</button>') + "</div>";
}
const annTarget = a => a.target === "all" ? "Herkes" : (unitOf(a.target) || PEOPLE[a.target] || {}).name || a.target;
function annHtml(list, adminMode) {
  if (!list.length) return '<p class="mu">Henüz duyuru yok.</p>';
  return [...list].sort((a, b) => b.createdAt - a.createdAt).map(a =>
    '<div class="ann">' + esc(a.text) + '<div class="mu">' + ago(a.createdAt) + " · " + esc(annTarget(a)) +
    (adminMode ? ' · <a href="#" data-delann="' + a.id + '" style="color:var(--dg)">sil</a>' : "") + "</div></div>").join("");
}

function memberView(s) {
  const p = PEOPLE[s], g = prog(s), t = mine(s);
  return '<div class="card"><h2 style="margin:0">Merhaba, ' + esc(p.name) + "</h2>" +
    p.units.map(u => '<span class="chip">' + esc(unitOf(u).name) + "</span> ").join("") +
    '<div class="bar" style="margin-top:12px"><i style="width:' + (g.n ? g.d / g.n * 100 : 0) + '%"></i></div>' +
    '<div class="mu">' + g.d + " / " + g.n + " görev tamamlandı</div></div>" +
    '<div class="card"><h2>Duyurular</h2>' + annHtml(S.anns, false) + "</div>" +
    '<div class="card"><h2>Görevlerim</h2>' + (t.length ? t.map(x => taskHtml(x, true)).join("") : '<p class="mu">Şu an atanmış görevin yok.</p>') + "</div>";
}

function adminView() {
  const tabs = '<div class="tabs">' + [["panel", "Panel"], ["ann", "Duyurular"], ["codes", "Davet kodları"]]
    .map(x => '<button data-tab="' + x[0] + '" class="' + (S.tab === x[0] && !S.view ? "on" : "") + '">' + x[1] + "</button>").join("") + "</div>";
  if (S.view) return tabs + personView(S.view);
  if (S.tab === "ann") return tabs + annAdmin();
  if (S.tab === "codes") return tabs + codesView();
  const joined = new Set(S.claims.map(c => c.id));
  return tabs + '<div class="grid">' + UNITS.map(u => {
    const all = u.m.map(n => prog(slug(n))), D = all.reduce((a, b) => a + b.d, 0), N = all.reduce((a, b) => a + b.n, 0);
    return '<div class="card"><h2 style="margin:0">' + esc(u.name) + '</h2><div class="mu">' + esc(u.sub) + "</div>" +
      '<div class="bar" style="margin:10px 0 2px"><i style="width:' + (N ? D / N * 100 : 0) + '%"></i></div><div class="mu">Birim: ' + D + " / " + N + "</div>" +
      u.m.map(n => { const s = slug(n), g = prog(s);
        return '<button class="person" data-view="' + s + '"><span class="dot' + (joined.has(s) ? " on" : "") + '"></span><span class="sp">' + esc(n) +
          '</span><span class="bar"><i style="width:' + (g.n ? g.d / g.n * 100 : 0) + '%"></i></span><span class="mu">' + g.d + "/" + g.n + "</span></button>"; }).join("") + "</div>";
  }).join("") + '</div><p class="mu">Yeşil nokta: kişi hesabını oluşturmuş.</p>';
}

function personView(s) {
  const p = PEOPLE[s];
  return '<div class="card"><div class="row"><button data-back>← Geri</button><h2 style="margin:0" class="sp">' + esc(p.name) + "</h2></div></div>" +
    '<div class="card"><h2>Görev ekle</h2><form data-addtask="' + s + '"><input name="title" placeholder="Görev başlığı" required>' +
    '<textarea name="desc" rows="2" placeholder="Açıklama (isteğe bağlı)"></textarea><div class="row"><select name="unit" style="width:auto">' +
    p.units.map(u => '<option value="' + u + '">' + esc(unitOf(u).name) + "</option>").join("") +
    '</select><input name="due" type="date" style="width:auto"><span class="sp"></span><button class="p">Ekle</button></div></form></div>' +
    '<div class="card"><h2>Görevler</h2>' + (mine(s).length ? mine(s).map(x => taskHtml(x, false)).join("") : '<p class="mu">Görev yok.</p>') + "</div>";
}

function annAdmin() {
  const opts = '<option value="all">Herkes</option>' + UNITS.map(u => '<option value="' + u.id + '">' + esc(u.name) + "</option>").join("") +
    '<optgroup label="Kişi">' + Object.keys(PEOPLE).map(s => '<option value="' + s + '">' + esc(PEOPLE[s].name) + "</option>").join("") + "</optgroup>";
  return '<div class="card"><h2>Yeni duyuru</h2><form data-addann><select name="target">' + opts + "</select>" +
    '<textarea name="text" rows="3" placeholder="Duyuru metni" required></textarea><div class="row"><span class="sp"></span><button class="p">Yayınla</button></div></form></div>' +
    '<div class="card"><h2>Tüm duyurular</h2>' + annHtml(S.anns, true) + "</div>";
}

function codesView() {
  const have = Object.fromEntries(S.people.map(p => [p.id, p])), joined = new Set(S.claims.map(c => c.id));
  const missing = Object.keys(PEOPLE).filter(s => !have[s]).length;
  return '<div class="card"><h2>Davet kodları</h2><p class="mu">Her kişiye kendi kodunu özelden gönder. Kişi "İlk kayıt" ekranında adını seçip kodu girer.</p>' +
    (missing ? '<button class="p" data-seed>' + missing + " kişi için kod üret</button>" : "") +
    Object.keys(PEOPLE).map(s => '<div class="row" style="margin-top:10px"><span class="sp">' + esc(PEOPLE[s].name) + "</span>" +
      (have[s] ? "<code>" + esc(have[s].code) + "</code>" : '<span class="mu">kod yok</span>') +
      '<span class="chip">' + (joined.has(s) ? "kayıtlı" : "bekliyor") + "</span></div>").join("") + "</div>";
}

/* ---------- Olaylar ---------- */
document.addEventListener("click", async e => {
  const b = e.target.closest("[data-mode],[data-view],[data-back],[data-tab],[data-deltask],[data-delann],[data-logout],[data-seed]");
  if (!b) return; const d = b.dataset;
  try {
    if (d.mode) { S.mode = d.mode; render(); }
    else if (d.view) { S.view = d.view; render(); scrollTo(0, 0); }
    else if (d.back !== undefined) { S.view = null; render(); }
    else if (d.tab) { S.tab = d.tab; S.view = null; render(); }
    else if (d.logout !== undefined) await signOut(auth);
    else if (d.deltask) { if (confirm("Görev silinsin mi?")) await deleteDoc(doc(db, "tasks", d.deltask)); }
    else if (d.delann) { e.preventDefault(); if (confirm("Duyuru silinsin mi?")) await deleteDoc(doc(db, "ann", d.delann)); }
    else if (d.seed !== undefined) {
      const have = new Set(S.people.map(p => p.id));
      for (const s of Object.keys(PEOPLE)) if (!have.has(s))
        await setDoc(doc(db, "people", s), { name: PEOPLE[s].name, units: PEOPLE[s].units, code: code6() });
    }
  } catch (err) { alert("İşlem başarısız."); }
});

document.addEventListener("change", async e => {
  const id = e.target.dataset.tick; if (!id) return;
  try { await updateDoc(doc(db, "tasks", id), { done: e.target.checked, doneAt: e.target.checked ? Date.now() : null }); }
  catch (err) { e.target.checked = !e.target.checked; alert("Tik atılamadı."); }
});

document.addEventListener("submit", async e => {
  e.preventDefault(); const f = e.target, v = Object.fromEntries(new FormData(f)), msg = document.getElementById("msg");
  try {
    if (f.dataset.addtask) { await addDoc(collection(db, "tasks"), { slug: f.dataset.addtask, unit: v.unit, title: v.title.trim(),
      desc: v.desc.trim(), due: v.due || "", done: false, doneAt: null, createdAt: Date.now() }); f.reset(); }
    else if (f.dataset.addann !== undefined) { await addDoc(collection(db, "ann"), { target: v.target, text: v.text.trim(), createdAt: Date.now() }); f.reset(); }
    else if (f.dataset.auth === "login") await signInWithEmailAndPassword(auth, v.email, v.pw);
    else if (f.dataset.auth === "register") {
      const cred = await createUserWithEmailAndPassword(auth, v.email, v.pw);
      try {
        await setDoc(doc(db, "claims", v.slug), { uid: cred.user.uid, code: v.code.trim().toUpperCase() });
        await setDoc(doc(db, "users", cred.user.uid), { slug: v.slug });
        S.me = v.slug; location.reload();
      } catch (err) {                                  // kod yanlış ya da isim alınmış
        await cred.user.delete();
        if (msg) msg.textContent = "Kod yanlış ya da bu isim zaten alınmış.";
      }
    }
  } catch (err) { if (msg) msg.textContent = "Hata: e-posta/şifre kontrol et."; else alert("İşlem başarısız."); }
});
