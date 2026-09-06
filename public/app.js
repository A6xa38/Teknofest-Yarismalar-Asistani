import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";

const h = React.createElement;

// teknofest.org'un kendi renkleri (ana sayfadan piksel örneklemesiyle alındı):
// uzay mavisi zemin, turuncu-kırmızı CTA, parlak mavi vurgu.
const BRAND = {
  navy: "#001b48",       // en koyu uzay mavisi (zemin dibi)
  navyMid: "#002d70",    // teknofest.org gövde mavisi
  blueMid: "#03398d",    // orta mavi (degrade ortası)
  blueGlow: "#4d6fd5",   // parlak mavi ışıma
  red: "#ca310a",        // teknofest "GİRİŞ YAP" turuncu-kırmızısı
  redDark: "#a52708",
  redLight: "#f25f3b",   // hover / aktif turuncu
  green: "#5a9e2f",
  blue: "#1a46ec",       // teknofest yıl seçici mavisi
  yellow: "#f2b705",
};

// teknofest.org'daki gibi derin uzay zemini: koyu maviden parlak maviye radyal
// degrade + yıldız dokusu. Tek yerde tanımlanıp tüm ekranlarda kullanılıyor.
const SPACE_BG = `radial-gradient(ellipse 120% 90% at 70% 15%, ${BRAND.blueGlow}55 0%, transparent 55%),` +
  `radial-gradient(ellipse 100% 80% at 20% 30%, ${BRAND.blueMid} 0%, transparent 60%),` +
  `linear-gradient(165deg, ${BRAND.navyMid} 0%, ${BRAND.navy} 55%, #000d24 100%)`;

const STAR_LAYER = {
  backgroundImage:
    "radial-gradient(1.6px 1.6px at 20px 30px, rgba(255,255,255,.9), transparent), " +
    "radial-gradient(1px 1px at 90px 80px, rgba(255,255,255,.7), transparent), " +
    "radial-gradient(1.4px 1.4px at 160px 40px, rgba(255,255,255,.85), transparent), " +
    "radial-gradient(1px 1px at 220px 110px, rgba(255,255,255,.6), transparent), " +
    "radial-gradient(1.2px 1.2px at 280px 20px, rgba(255,255,255,.75), transparent), " +
    "radial-gradient(1px 1px at 50px 130px, rgba(255,255,255,.5), transparent)",
  backgroundSize: "340px 160px",
  backgroundRepeat: "repeat",
};

// teknofest.org'un turuncu CTA butonu: köşeleri hafif yuvarlak, kalın,
// büyük harf, hover'da açık turuncuya geçiyor.
// SQLite datetime('now') UTC döndürüyor; ekranda yerel saat gösterelim.
function fmtDate(v) {
  if (!v) return "";
  const d = new Date(String(v).replace(" ", "T") + (String(v).endsWith("Z") ? "" : "Z"));
  if (isNaN(d)) return v;
  const onlyDate = !/[ T]\d{2}:/.test(String(v));
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    ...(onlyDate ? {} : { hour: "2-digit", minute: "2-digit" }),
  });
}

const CTA_CLASS =
  "inline-flex items-center justify-center gap-2 font-bold uppercase tracking-wide " +
  "text-white rounded transition-colors disabled:opacity-50";

// TEKNOFEST'in kendi sitesinden alınan gerçek yarışma isimleri. Şu an sadece
// "iha" için gerçek bir bilgi tabanı (şartname + kılavuzlar) yüklü; aynı
// pipeline (pdftotext -> chunk -> embed -> vectorize) her yarışma için
// tekrarlanarak diğerleri de aktif hale getirilebilir.
const COMPETITIONS = [
  { id: "iha", name: "Uluslararası İnsansız Hava Aracı (İHA) Yarışması", ready: true },
  { id: "5g_yz_yol", name: "5G & Yapay Zeka ile Akıllı Yol Güvenliği Yarışması", ready: true },
  { id: "biyoteknoloji", name: "Biyoteknoloji İnovasyon Yarışması", ready: true },
  { id: "blokzincir", name: "Blokzincir Yarışması", ready: true },
  { id: "cip_tasarim", name: "Çip Tasarım Yarışması", ready: true },
  { id: "dikey_inisli_roket", name: "Dikey İnişli Roket Yarışması", ready: false },
  { id: "e_ticaret", name: "E-Ticaret Yarışması", ready: false },
  { id: "lojistik_optimizasyon", name: "Yapay Zeka Destekli Lojistik Anahat Optimizasyonu Yarışması", ready: false },
  { id: "finansal_teknolojiler", name: "Finansal Teknolojiler Yarışması", ready: false },
  { id: "hareketli_uydu_terminali", name: "Hareketli Uydu Terminali Yarışması", ready: false },
  { id: "havacilikta_yz", name: "Havacılıkta Yapay Zeka Yarışması", ready: false },
  { id: "celikkubbe", name: "Çelikkubbe Hava Savunma Sistemleri Yarışması", ready: false },
  { id: "hyperloop", name: "Hyperloop Geliştirme Yarışması", ready: false },
  { id: "insansiz_deniz", name: "İnsansız Deniz Aracı Yarışması", ready: false },
  { id: "insansiz_kara", name: "İnsansız Kara Aracı Yarışması", ready: false },
  { id: "insansiz_sualti", name: "İnsansız Su Altı Sistemleri Yarışması", ready: false },
  { id: "insansiz_sualti_yildizlar", name: "İnsansız Su Altı Sistemleri Yıldızlar Yarışması", ready: false },
  { id: "jet_motor", name: "Jet Motor Tasarım Yarışması", ready: false },
  { id: "kuantum", name: "Kuantum Teknolojileri Yarışması", ready: false },
  { id: "savasan_iha", name: "Savaşan İHA Yarışması", ready: false },
  { id: "savasan_iha_yildizlar", name: "Savaşan İHA Yıldızlar Yarışması", ready: false },
  { id: "savasan_iha_avci", name: "Savaşan İHA Avcı Drone Yarışması", ready: false },
  { id: "sualti_roket", name: "Su Altı Roket Yarışması", ready: false },
  { id: "tarim_teknolojileri", name: "Tarım Teknolojileri Yarışması", ready: false },
  { id: "drone_sampiyonasi", name: "TEKNOFEST Drone Şampiyonası", ready: false },
  { id: "mimari_tasarim", name: "TEKNOFEST Mimari ve Görsel Tasarım Yarışması", ready: false },
  { id: "robolig", name: "TEKNOFEST Robolig Yarışması", ready: false },
  { id: "world_drone_cup", name: "World Drone Cup", ready: false },
  { id: "elektrikli_arac", name: "Uluslararası Elektrikli Araç Yarışları", ready: false },
  { id: "universite_arastirma", name: "Üniversite Öğrencileri Araştırma Proje Yarışmaları", ready: false },
  { id: "havayolu_optimizasyon", name: "Yapay Zeka Destekli Havayolu Optimizasyonu Yarışması", ready: false },
  { id: "dil_ajanlari", name: "Yapay Zeka Dil Ajanları Yarışması", ready: false },
  { id: "fpv_drone", name: "FPV Drone İzleme (Tracking) Yarışması", ready: false },
  { id: "otonom_sistemler", name: "İleri Otonom Sistemler Tasarım ve Operasyon Yarışması", ready: false },
  { id: "sifir_atik", name: "Sıfır Atık & Döngüsel Ekonomi Yarışması", ready: false },
  { id: "nsosyal", name: "NSOSYAL İnovasyon Yarışması", ready: false },
  { id: "mavi_vatan_madde", name: "KÜRE TEKNOFEST Mavi Vatan Madde Yazım Yarışması", ready: false },
  { id: "mesleki_yetenek", name: "TEKNOFEST Mesleki Yetenek Yarışması", ready: false },
  { id: "hackmasters", name: "HackMasters Güneydoğu", ready: false },
  { id: "yz_film", name: "TEKNOFEST Yapay Zeka Film Yarışması", ready: false },
  { id: "maden_teknolojileri", name: "Maden Teknolojileri Yarışması", ready: false },
  { id: "elektronik_harp", name: "Elektronik Harp Yarışması", ready: false },
];

// İlk kullanımda yol gösteren örnek sorular — her yarışmanın kendi
// şartnamesindeki konulardan seçildi (yarışma seçilmeden gösterilmez).
const FAQ_SUGGESTIONS = {
  iha: [
    "Sabit kanat görev videosunda hangi çekim açıları zorunlu?",
    "PSR raporunun sayfa/puan dağılımı nasıl?",
    "Başvuru için hangi belgeler gerekiyor?",
    "Uçuş sırasında uyulması gereken kurallar nelerdir?",
    "İHA'nın ağırlık ve tasarım kısıtları neler?",
  ],
  "5g_yz_yol": [
    "Yarışma aşamaları nelerdir?",
    "Eğitim ve test verileri nasıl sağlanıyor?",
    "Hedef/nesne tespitinde hangi metrikler kullanılıyor?",
    "FTR aşamasında neler teslim edilmeli?",
    "Hangi yazılım ve donanımlar kullanılabilir?",
  ],
  biyoteknoloji: [
    "Kimler başvurabilir?",
    "Proje detay raporunda neler olmalı?",
    "Değerlendirme kriterleri nelerdir?",
    "Kategoriler ve yaş sınırları neler?",
    "Ödüller nasıl dağıtılıyor?",
  ],
  blokzincir: [
    "Yarışmanın konusu ve amacı nedir?",
    "Takım kurma şartları nelerdir?",
    "Hangi teknolojiler kullanılabilir?",
    "Ön değerlendirme raporunda neler isteniyor?",
    "Finalde nasıl bir sunum bekleniyor?",
  ],
  cip_tasarim: [
    "Analog ve mikrodenetleyici kategorileri arasındaki fark nedir?",
    "Hangi tasarım araçları kullanılacak?",
    "Ön tasarım raporunda neler isteniyor?",
    "Değerlendirme nasıl yapılıyor?",
    "Takım üyeleri için şartlar neler?",
  ],
};

const GENERIC_SUGGESTIONS = [
  "Başvuru için hangi belgeler gerekiyor?",
  "Yarışma takvimi ve aşamaları nasıl?",
  "Değerlendirme kriterleri nelerdir?",
  "Takım kurma şartları nelerdir?",
];

function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, []);
  return users;
}

function Badge({ children, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-600 border border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border border-amber-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    navy: "bg-[#eef1f8] text-[#0a1230] border border-[#dbe0ee]",
  };
  return h(
    "span",
    { className: `px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}` },
    children
  );
}

// Hangi kaynak başlıklarının PDF'i sunucuda duruyor? Uygulama başına bir kez
// sorulur; olmayan başlıkları bağlantıya çevirmeyelim ki kırık link olmasın.
let KAYNAK_BASLIK_KUMESI = null;
function useKaynakBasliklari() {
  const [kume, setKume] = useState(KAYNAK_BASLIK_KUMESI);
  useEffect(() => {
    if (KAYNAK_BASLIK_KUMESI) return;
    fetch("/api/kaynaklar")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        KAYNAK_BASLIK_KUMESI = new Set((d && d.basliklar) || []);
        setKume(KAYNAK_BASLIK_KUMESI);
      })
      .catch(() => {});
  }, []);
  return kume;
}

function SourceBadges({ sources, ilgili }) {
  const mevcut = useKaynakBasliklari();
  const liste = sources || [];
  const acilabilirVar = liste.some((s) => mevcut && mevcut.has(s.source_title));
  return h(
    "div",
    { className: "mt-2" },
    h(
      "div",
      { className: "flex flex-wrap gap-1.5" },
      liste.map((s, i) => {
        const etiket = `${s.source_title} · s.${s.page}` + (s.madde_no ? ` · Madde ${s.madde_no}` : "");
        const acilabilir = mevcut && mevcut.has(s.source_title);
        if (!acilabilir) return h(Badge, { key: i, tone: "navy" }, etiket);
        // Aynı sunucudan servis edildiği için tarayıcının PDF görüntüleyicisi
        // #page=N ile doğru sayfaya atlar.
        const adres = `/api/kaynak?baslik=${encodeURIComponent(s.source_title)}#page=${s.page}`;
        return h(
          "a",
          {
            key: i,
            href: adres,
            target: "_blank",
            rel: "noreferrer",
            title: `Şartnameyi ${s.page}. sayfada aç`,
            className:
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11.5px] font-semibold " +
              "no-underline transition-colors border-[#1a46ec]/35 text-[#03398d] bg-[#1a46ec]/[0.07] " +
              "hover:bg-[#1a46ec]/15 hover:border-[#1a46ec]/60",
          },
          // Belge ikonu — rozetin tıklanabilir olduğunu tek bakışta anlatır.
          h(
            "svg",
            { width: 13, height: 13, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2 },
            h("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
            h("path", { d: "M14 2v6h6" })
          ),
          h("span", null, etiket),
          h("span", { className: "opacity-60" }, "↗")
        );
      })
    ),
    acilabilirVar &&
      h(
        "p",
        { className: "text-[11px] text-slate-500 mt-1.5" },
        ilgili
          ? "İlgili şartname bölümü — tıklayın, PDF o sayfada açılır."
          : "Kaynağa tıklayın — şartname PDF'i ilgili sayfada açılır."
      )
  );
}

// --- Yarışma alanına göre ikon: teknofest.org'daki yarışma kartlarında her
// yarışmanın kendi görseli var. Burada aynı hissi vermek için alan bazlı
// (hava/uzay, çip, biyo, zincir, yol, deniz, robot...) inline SVG ikonlar
// kullanılıyor — harici görsel dosyası gerekmiyor.
// Her ikon, birden fazla alt yoldan oluşur (tek uzun path yerine) — küçük
// boyutlarda okunaklı kalması için.
const ICON_PATHS = {
  plane: ["M12 3c1.4 1.9 2.2 4.3 2.2 6.6l5.3 3.1v2.3l-5.4-1.7v3.5l2.2 1.7v1.8L12 19.4 7.7 20.3v-1.8l2.1-1.7v-3.5l-5.3 1.7v-2.3l5.3-3.1C9.8 7.3 10.6 4.9 12 3z"],
  chip: ["M8 8h8v8H8z", "M4 10v4M20 10v4M10 4h4M10 20h4", "M8 8h8v8H8z"],
  dna: ["M8 3c0 5.5 8 5.5 8 11", "M16 3c0 5.5-8 5.5-8 11", "M8.7 7h6.6M8.7 14h6.6", "M8 18v3M16 18v3"],
  chain: ["M10.6 13.4a3.5 3.5 0 010-5l1.6-1.6a3.5 3.5 0 015 5l-1 1", "M13.4 10.6a3.5 3.5 0 010 5l-1.6 1.6a3.5 3.5 0 01-5-5l1-1"],
  road: ["M8 3L4 21M16 3l4 18", "M12 4v3M12 10.5v3M12 17v3"],
  ship: ["M4 14l8-3 8 3-1.8 6a2 2 0 01-1.9 1.4H7.7A2 2 0 015.8 20L4 14z", "M12 11V4M8.5 7h7"],
  robot: ["M7 9h10a1 1 0 011 1v6a1 1 0 01-1 1H7a1 1 0 01-1-1v-6a1 1 0 011-1z", "M12 5.5V9M12 3.2v.6", "M3.5 12v2M20.5 12v2", "M9.8 12.8v.6M14.2 12.8v.6"],
  rocket: ["M12 2.5c2.7 2.9 4.2 6.5 4.2 10.3L12 16.6l-4.2-3.8C7.8 9 9.3 5.4 12 2.5z", "M9.3 15.6L7 21l5-2 5 2-2.3-5.4", "M12 8.4v.6"],
  star: ["M12 3.2l2.6 5.9 6.2.6-4.7 4.2 1.4 6.1L12 16.8 6.5 20l1.4-6.1L3.2 9.7l6.2-.6z"],
};

function iconFor(name) {
  const n = name.toLocaleLowerCase("tr");
  if (/(iha|drone|hava|uçuş|jet|havacılık|havayolu|fpv|roket|uydu)/.test(n)) return "plane";
  if (/(çip|elektronik|kuantum|mikro)/.test(n)) return "chip";
  if (/(biyo|tarım|sıfır atık|maden)/.test(n)) return "dna";
  if (/(blokzincir|finans|e-ticaret|lojistik)/.test(n)) return "chain";
  if (/(yol|elektrikli|hyperloop|kara)/.test(n)) return "road";
  if (/(deniz|su altı|sualtı|mavi vatan)/.test(n)) return "ship";
  if (/(robo|otonom|ajan|yapay zeka|savunma|kubbe|harp)/.test(n)) return "robot";
  if (/(araştırma|proje|mimari|film|sosyal|yetenek|hack)/.test(n)) return "star";
  return "rocket";
}

function Icon({ name, size = 20, className = "" }) {
  return h(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 1.8,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className,
    },
    (ICON_PATHS[name] || ICON_PATHS.rocket).map((d, i) => h("path", { key: i, d }))
  );
}

// --- Ortak sayfa iskeleti: her iç ekran (Talebimi Sorgula, Hakem/İçerik/Admin
// panelleri) CompetitionPicker/ChatPanel ile aynı görsel dili paylaşır:
// teknofest.org tarzı uzay mavisi üst bant + açık gri gövde.
function PageHero({ title, subtitle, onBack }) {
  return h(
    "div",
    { className: "relative overflow-hidden px-4 sm:px-8 py-9", style: { background: SPACE_BG } },
    h("div", { className: "absolute inset-0 opacity-50", style: STAR_LAYER }),
    h("div", {
      className: "absolute -top-16 right-8 w-56 h-56 rounded-full blur-3xl opacity-25 pointer-events-none",
      style: { background: BRAND.blueGlow },
    }),
    // T3 renk şeridi — alt kenarda ince bir vurgu
    h("div", {
      className: "absolute bottom-0 left-0 right-0 h-1",
      style: { background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.blue}, ${BRAND.yellow})` },
    }),
    h(
      "div",
      { className: "relative max-w-6xl mx-auto" },
      onBack &&
        h(
          "button",
          { className: "text-[11px] font-semibold uppercase tracking-wider text-white/60 hover:text-white", onClick: onBack },
          "← Geri dön"
        ),
      h("h1", { className: "text-2xl sm:text-3xl font-extrabold text-white mt-2 tracking-tight" }, title),
      subtitle && h("p", { className: "text-sm text-white/65 mt-1.5" }, subtitle)
    )
  );
}

function PageShell({ hero, children }) {
  return h(
    "div",
    { className: "min-h-screen bg-[#eef2f7]" },
    hero,
    h("div", { className: "max-w-6xl mx-auto p-4 sm:p-8 space-y-4" }, children)
  );
}

// Beyaz içerik kartı — teknofest.org'un kart stili: net kenar, yumuşak gölge.
function Card({ children, className = "", accent }) {
  return h(
    "div",
    {
      className: `bg-white rounded-xl border border-slate-200/80 shadow-[0_1px_3px_rgba(0,27,72,0.06)] ${className}`,
      style: accent ? { borderTopWidth: 3, borderTopColor: accent } : undefined,
    },
    children
  );
}

// --- Üst başlık: TEKNOFEST'e yakın lacivert/yıldızlı bar --------------------
// NOT: dış kapsayıcıda overflow-hidden YOK — staff giriş formu (dropdown)
// bunun içinde absolute konumlanıyor, overflow-hidden olursa kırpılıp
// görünmez oluyordu (bildirilen "tıklayınca beyaz bir şey iniyor ama
// açılmıyor" hatası buydu).
function TopBar({ onLogoClick, onTrackClick, staffLoginSlot, panelSlot, trackLabel, trackLabelShort }) {
  return h(
    "div",
    {
      className: "relative",
      style: { background: `linear-gradient(180deg, ${BRAND.navy} 0%, #00143a 100%)` },
    },
    h("div", { className: "absolute inset-0 opacity-35", style: STAR_LAYER }),
    h(
      "div",
      { className: "relative max-w-6xl mx-auto px-4 sm:px-8 py-3 flex items-center gap-3" },
      h(
        "button",
        { className: "flex items-center gap-3 shrink-0", onClick: onLogoClick },
        h("img", {
          src: "/assets/teknofest-logo.png",
          alt: "TEKNOFEST",
          className: "h-11 w-auto drop-shadow-[0_0_10px_rgba(120,170,255,0.35)]",
        }),
        h(
          "div",
          { className: "text-left border-l border-white/15 pl-3" },
          h(
            "div",
            { className: "text-white text-[13px] sm:text-sm font-extrabold uppercase tracking-wide leading-tight" },
            "Yarışmalar Asistanı"
          ),
          h("div", { className: "text-white/45 text-[10px] leading-tight tracking-[0.2em] uppercase" }, "T3")
        )
      ),
      h("div", { className: "flex-1" }),
      // teknofest.org tarzı büyük harf, kalın nav bağlantısı
      h(
        "button",
        {
          className:
            "hidden sm:block text-white/85 text-[11px] font-bold uppercase tracking-wider hover:text-white transition-colors",
          onClick: onTrackClick,
        },
        trackLabel || "Talebimi Sorgula"
      ),
      h(
        "button",
        {
          className:
            "sm:hidden text-white/85 text-[11px] font-bold uppercase tracking-wider",
          onClick: onTrackClick,
        },
        trackLabelShort || "Talebim"
      ),
      panelSlot,
      staffLoginSlot
    ),
    // T3 renk şeridi
    h("div", {
      className: "h-[3px] w-full",
      style: { background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.blue}, ${BRAND.yellow})` },
    })
  );
}

// --- Yarışma seçim ekranı -----------------------------------------------
function CompetitionPicker({ onSelect }) {
  const [query, setQuery] = useState("");
  const [showRest, setShowRest] = useState(false);
  // "Aktif" durumu artık koddaki bayrağa değil, veritabanındaki aktif belgelere
  // bakıyor: İçerik Yöneticisi bir yarışmaya PDF yükleyince o yarışma kendi
  // kendine açılıyor. Uç nokta cevap vermezse koddaki liste yedek kalır.
  const [dbReady, setDbReady] = useState(null);
  const [dbChunks, setDbChunks] = useState(null);
  useEffect(() => {
    fetch("/api/ready-competitions")
      .then((r) => (r.ok ? r.json() : { ready: [] }))
      .then((d) => {
        setDbReady(Array.isArray(d.ready) ? d.ready : []);
        if (typeof d.panel_chunks === "number") setDbChunks(d.panel_chunks);
      })
      .catch(() => setDbReady([]));
  }, []);
  const isReady = (c) => c.ready || (dbReady || []).includes(c.id);

  const filtered = COMPETITIONS.filter((c) => c.name.toLocaleLowerCase("tr").includes(query.toLocaleLowerCase("tr")));
  const ready = filtered.filter(isReady);
  const rest = filtered.filter((c) => !isReady(c));

  const readyCount = COMPETITIONS.filter(isReady).length;
  // Bilgi tabanındaki toplam doğrulanmış kaynak parçası sayısı
  // (İHA 317 + 5G 59 + Biyoteknoloji 51 + Blokzincir 29 + Çip 77).
  // 533 parça betikle yüklendi (İHA 317 + 5G 59 + Biyoteknoloji 51 +
  // Blokzincir 29 + Çip 77). Panelden yüklenen belgelerin parçaları bunun
  // üstüne ekleniyor, böylece yeni bir kaynak yüklendiğinde sayı artıyor.
  const BASE_CHUNKS = 533;
  const sourceChunkCount = BASE_CHUNKS + (dbChunks || 0);

  return h(
    "div",
    { className: "bg-[#eef2f7]" },
    // === HERO: teknofest.org ana sayfası gibi derin uzay zemini ===============
    h(
      "div",
      { className: "relative overflow-hidden px-4 sm:px-8 pt-16 pb-20 text-center", style: { background: SPACE_BG } },
      h("div", { className: "absolute inset-0 opacity-60", style: STAR_LAYER }),
      // teknofest.org'daki gezegen/ışıma hissi: büyük yumuşak mavi küre
      h("div", {
        className: "absolute -top-40 left-1/2 -translate-x-1/2 w-[38rem] h-[38rem] rounded-full pointer-events-none",
        style: { background: `radial-gradient(circle, ${BRAND.blueGlow}40 0%, transparent 62%)` },
      }),
      h("div", {
        className: "absolute -bottom-28 -left-24 w-80 h-80 rounded-full blur-3xl opacity-25 pointer-events-none",
        style: { background: BRAND.red },
      }),
      h("div", {
        className: "absolute -bottom-24 -right-20 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none",
        style: { background: BRAND.blueGlow },
      }),
      h(
        "div",
        { className: "relative max-w-3xl mx-auto flex flex-col items-center" },
        h("img", {
          src: "/assets/teknofest-logo.png",
          alt: "TEKNOFEST",
          className: "h-28 w-auto mb-6 drop-shadow-[0_0_28px_rgba(140,180,255,0.45)]",
        }),
        h(
          "h1",
          { className: "text-3xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1]" },
          "TEKNOFEST Yarışmalar Asistanı"
        ),
        h(
          "p",
          { className: "text-sm sm:text-base text-white/70 mt-4 max-w-xl leading-relaxed" },
          "Sorularınızı yalnızca doğrulanmış resmi kaynaklardan cevaplıyoruz."
        ),
        // teknofest.org'un istatistik blokları tarzında, sadece doğrulanabilir
        // sayılar (iddia niteliğindeki "%100 / 0 uydurma" blokları kaldırıldı).
        h(
          "div",
          { className: "grid grid-cols-2 gap-3 sm:gap-5 mt-9 w-full max-w-sm" },
          [
            [String(readyCount), "yarışma aktif"],
            [String(sourceChunkCount), "kaynak"],
          ].map(([big, small], i) =>
            h(
              "div",
              {
                key: i,
                className: "rounded-lg py-3 px-2 backdrop-blur-sm",
                style: { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" },
              },
              h("div", { className: "text-xl sm:text-2xl font-extrabold text-white" }, big),
              h("div", { className: "text-[10px] sm:text-[11px] uppercase tracking-wider text-white/55 mt-0.5" }, small)
            )
          )
        ),
        // Sayılar bağlamsız kalmasın: "533 kaynak" neyin sayısı olduğunu bir
        // satırla söylüyoruz. Jüri ilk karede gerçek veriyle çalıştığını görsün.
        h(
          "p",
          { className: "text-[12px] sm:text-[13px] text-white/55 mt-4 max-w-md leading-relaxed" },
          `${readyCount} yarışmanın 2026 resmî şartname ve kılavuzlarından çıkarılmış, ` +
            `madde numarası etiketli ${sourceChunkCount} kaynak parçası.`
        ),
        h(
          "div",
          { className: "flex justify-center gap-1.5 mt-9" },
          h("span", { className: "h-1.5 w-14 rounded-full", style: { backgroundColor: BRAND.red } }),
          h("span", { className: "h-1.5 w-14 rounded-full", style: { backgroundColor: BRAND.blue } }),
          h("span", { className: "h-1.5 w-14 rounded-full", style: { backgroundColor: BRAND.yellow } })
        )
      )
    ),
    // === YARIŞMA SEÇİMİ ======================================================
    h(
      "div",
      { className: "max-w-5xl mx-auto px-4 sm:px-8 -mt-10 pb-12 relative" },
      h(
        Card,
        { className: "p-5 sm:p-7" },
        h(
          "div",
          { className: "flex flex-col sm:flex-row sm:items-end gap-4 mb-6" },
          h(
            "div",
            { className: "flex-1" },
            h(
              "h2",
              { className: "text-lg sm:text-xl font-extrabold uppercase tracking-wide", style: { color: BRAND.navyMid } },
              "Yarışmanı Seç"
            ),
            h(
              "p",
              { className: "text-sm text-slate-500 mt-1" },
              `${readyCount} yarışmanın bilgi tabanı hazır. Diğerleri kaynakları yüklendikçe açılacak.`
            )
          ),
          h(
            "div",
            { className: "relative sm:w-72" },
            h(
              "svg",
              {
                className: "absolute left-3 top-1/2 -translate-y-1/2 text-slate-400",
                width: 16,
                height: 16,
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: 2,
              },
              h("circle", { cx: 11, cy: 11, r: 7 }),
              h("line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
            ),
            h("input", {
              className:
                "w-full border border-slate-300 rounded pl-9 pr-3 py-2.5 text-sm focus:outline-none " +
                "focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
              placeholder: "Yarışma ara...",
              value: query,
              onChange: (e) => setQuery(e.target.value),
            })
          )
        ),
        // Hazır yarışmalar: teknofest.org yarışma kartları gibi ikonlu, tıklanabilir
        ready.length > 0 &&
          h(
            "div",
            { className: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" },
            ready.map((comp, idx) => {
              const accent = [BRAND.red, BRAND.blue, BRAND.yellow][idx % 3];
              return h(
                "button",
                {
                  key: comp.id,
                  onClick: () => onSelect(comp),
                  className:
                    "group text-left p-4 rounded-lg border border-slate-200 bg-white transition-all " +
                    "hover:border-transparent hover:shadow-[0_8px_24px_rgba(0,27,72,0.13)] hover:-translate-y-1 cursor-pointer",
                },
                h(
                  "div",
                  {
                    className: "w-10 h-10 rounded-lg flex items-center justify-center text-white mb-3 transition-transform group-hover:scale-105",
                    style: { background: `linear-gradient(135deg, ${accent}, ${accent}bb)` },
                  },
                  h(Icon, { name: iconFor(comp.name), size: 20 })
                ),
                h("div", { className: "font-bold text-sm leading-snug", style: { color: BRAND.navy } }, comp.name),
                h(
                  "div",
                  { className: "flex items-center gap-1.5 mt-2.5 text-[11px] font-semibold text-emerald-700" },
                  h("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-500" }),
                  "Bilgi tabanı hazır"
                )
              );
            })
          ),
        // Yakında açılacaklar: sadeleştirilmiş, gri liste (kart gürültüsü olmadan)
        rest.length > 0 &&
          h(
            "div",
            { className: "mt-8" },
            h(
              "button",
              {
                className:
                  "text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3 " +
                  "hover:text-slate-600 transition-colors",
                onClick: () => setShowRest((v) => !v),
              },
              `${showRest ? "▾" : "▸"} Yakında — kaynak bekleniyor (${rest.length})`
            ),
            showRest &&
            h(
              "div",
              { className: "flex flex-wrap gap-2" },
              rest.map((comp) =>
                h(
                  "span",
                  {
                    key: comp.id,
                    className: "inline-flex items-center gap-1.5 text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5",
                  },
                  h(Icon, { name: iconFor(comp.name), size: 13, className: "text-slate-400 shrink-0" }),
                  comp.name
                )
              )
            )
          ),
        filtered.length === 0 && h("p", { className: "text-sm text-slate-400 text-center py-6" }, "Eşleşen yarışma yok.")
      )
    )
  );
}

// --- İtiraz / geri bildirim formu (sadece AI cevap veremediğinde açılır) ---
function ItirazForm({ competition, prefillQuestion, relatedTicketId, currentUser, onDone, reason }) {
  const [teamId, setTeamId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [question, setQuestion] = useState(prefillQuestion || "");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    let data;
    try {
      const res = await fetch("/api/itiraz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser?.id,
          competition: competition?.id,
          team_id: teamId,
          application_id: applicationId,
          question,
          decision_reason: decisionReason,
          related_ticket_id: relatedTicketId,
        }),
      });
      data = await res.json();
      // Eskiden res.ok kontrol edilmiyordu: sunucu talebi reddettiğinde
      // ticket_id undefined kalıyor, form hiç değişmiyor ve buton ölü
      // görünüyordu. Artık gerçek sebep yazıyor.
      if (!res.ok) {
        setError(data.error || `Talep gönderilemedi (HTTP ${res.status}).`);
        return;
      }
    } catch (err) {
      setError("Sunucuya ulaşılamadı: " + err.message);
      return;
    }
    setSent(data.ticket_id);
    onDone && onDone(data.ticket_id);
  };

  if (sent) {
    return h(
      "div",
      { className: "mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 space-y-1.5" },
      h("div", { className: "flex items-center gap-2" }, h(Badge, { tone: "amber" }, "Uzmana yönlendirildi")),
      h(
        "p",
        null,
        `Talebiniz #${sent} numarasıyla iletildi. "Talebimi Sorgula" ekranından Takım ID / Başvuru ID ile durumunu takip edebilirsiniz.`
      )
    );
  }

  // Etiketli bir alan: üstte küçük, kalıcı bir başlık + altında input/textarea.
  // Önceden alan adı sadece placeholder olarak görünüyordu ve yazmaya
  // başlayınca kayboluyordu — artık her zaman görünen bir üst etiket var.
  const Field = (label, node) =>
    h(
      "div",
      null,
      h("label", { className: "text-xs font-medium text-slate-600 mb-1 block" }, label),
      node
    );

  return h(
    "div",
    { className: "mt-3 p-4 rounded-xl border border-amber-200 bg-amber-50 space-y-3" },
    h(
      "p",
      { className: "text-sm font-semibold text-amber-800" },
      reason === "feedback"
        ? "Cevabı yeterli bulmadınız — talebinizi bir uzmana iletelim. Aşağıdaki bilgileri girin"
        : "Sorunuza kaynaklarda cevap bulamadık — talebinizi inceleyebilmemiz için aşağıdaki bilgileri girin"
    ),
    h(
      "div",
      { className: "grid grid-cols-2 gap-2" },
      Field(
        "Takım ID",
        h("input", {
          className: "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm",
          value: teamId,
          onChange: (e) => setTeamId(e.target.value),
        })
      ),
      Field(
        "Başvuru ID",
        h("input", {
          className: "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm",
          value: applicationId,
          onChange: (e) => setApplicationId(e.target.value),
        })
      )
    ),
    Field(
      "Aklınızdaki sorunun tam halini yazar mısınız?",
      h("textarea", {
        className: "border border-slate-300 rounded-lg px-3 py-2 text-sm w-full",
        rows: 3,
        value: question,
        onChange: (e) => setQuestion(e.target.value),
      })
    ),
    Field(
      "Eklemek istediğiniz bir şey var mı? (opsiyonel)",
      h("textarea", {
        className: "border border-slate-300 rounded-lg px-3 py-2 text-sm w-full",
        rows: 2,
        value: decisionReason,
        onChange: (e) => setDecisionReason(e.target.value),
      })
    ),
    error &&
      h(
        "p",
        { className: "text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-2 font-medium" },
        error
      ),
    h(
      "button",
      {
        className: CTA_CLASS + " text-xs px-5 py-2.5",
        style: { backgroundColor: BRAND.red },
        onMouseEnter: (e) => (e.currentTarget.style.backgroundColor = BRAND.redLight),
        onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = BRAND.red),
        onClick: submit,
      },
      "Talebi Gönder"
    )
  );
}

// --- 👍/👎 geri bildirim -----------------------------------------------------
function FeedbackButtons({ ticketId, onNegative }) {
  const [given, setGiven] = useState(null);
  const [hata, setHata] = useState("");

  const send = async (helpful) => {
    setGiven(helpful);
    setHata("");
    if (!helpful) onNegative && onNegative();
    // Eskiden bu istek "sessizce yut" ile sarılıydı: sunucu hata dönse bile
    // ekranda teşekkür yazısı çıkıyor, geri bildirim hiçbir yere yazılmıyordu.
    try {
      const r = await fetch(`/api/tickets/${ticketId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ helpful }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setHata(d.error || `Geri bildirim kaydedilemedi (HTTP ${r.status}).`);
      }
    } catch (e) {
      setHata("Geri bildirim gönderilemedi: " + e.message);
    }
  };

  if (given !== null) {
    return h(
      "span",
      { className: "text-xs " + (hata ? "text-red-700" : "text-slate-400") },
      hata || (given ? "Geri bildiriminiz için teşekkürler 🙂" : "Bildirildi, ekibimize iletiliyor.")
    );
  }

  return h(
    "div",
    { className: "flex items-center gap-2 text-xs text-slate-500" },
    h("span", null, "Bu cevap yardımcı oldu mu?"),
    h(
      "button",
      { className: "hover:scale-110 transition", onClick: () => send(true), title: "Evet" },
      "👍"
    ),
    h(
      "button",
      { className: "hover:scale-110 transition", onClick: () => send(false), title: "Hayır" },
      "👎"
    )
  );
}

function ChatPanel({ competition, currentUser }) {
  const [question, setQuestion] = useState("");
  const [showAllFaqs, setShowAllFaqs] = useState(false);
  // Talep formu artık kendiliğinden açılmıyor; sohbet akışını bozmasın diye
  // yarışmacı isterse açıyor.
  const [openForms, setOpenForms] = useState({});
  const historyRef = React.useRef(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [faqs, setFaqs] = useState([]);

  useEffect(() => {
    fetch(`/api/faqs?competition=${encodeURIComponent(competition.id)}`)
      .then((r) => r.json())
      .then((d) => setFaqs(d.faqs || []))
      .catch(() => setFaqs([]));
  }, [competition.id]);

  const ask = useCallback(
    async (overrideQuestion) => {
      const q = (overrideQuestion ?? question).trim();
      if (!q) return;
      // Sunucu 3 karakterden kısa soruyu reddediyor; kullanıcıya boş bir
      // "AI cevabı" balonu göstermek yerine burada engelliyoruz.
      if (q.length < 3) {
        setHistory((h_) => [
          ...h_,
          { question: q, answer: "Sorunuzu biraz daha açık yazabilir misiniz? (en az 3 karakter)", sources: [], needs_human: false, error: true },
        ]);
        setQuestion("");
        return;
      }
      setLoading(true);
      setQuestion("");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Takip sorularının ("peki döner kanatta?") çözülebilmesi için son
          // üç soru-cevabı da gönderiyoruz. Cevaplar kısaltılıyor: amaç bağlam
          // vermek, tüm metni tekrar taşımak değil.
          body: JSON.stringify({
            question: q,
            user_id: currentUser?.id,
            competition: competition.id,
            gecmis: history
              .filter((it) => it && !it.error && it.answer && !it.out_of_scope)
              .slice(-3)
              .map((it) => ({ soru: it.question, cevap: String(it.answer).slice(0, 600) })),
          }),
        });
        const data = await res.json();
        // res.ok kontrol edilmezse, sunucunun {error:"..."} yanıtı history'e
        // yayılıyor; answer undefined kalıp yeşil "AI cevabı" etiketiyle boş
        // bir balon görünüyordu.
        if (!res.ok) {
          setHistory((h_) => [
            ...h_,
            {
              question: q,
              answer: data.error || `Cevap alınamadı (HTTP ${res.status}).`,
              sources: [],
              needs_human: false,
              error: true,
            },
          ]);
          return;
        }
        setHistory((h_) => [...h_, { question: q, ...data }]);
      } catch (e) {
        setHistory((h_) => [
          ...h_,
          { question: q, answer: "Hata: sunucuya ulaşılamadı.", sources: [], needs_human: false, error: true },
        ]);
      } finally {
        setLoading(false);
        // Cevap listenin başına eklendiği için oraya kaydırıyoruz; aksi hâlde
        // sayfa aşağıdayken cevap geldiği fark edilmiyordu.
        setTimeout(() => {
          try {
            historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch {}
        }, 80);
      }
    },
    [question, currentUser, competition]
  );

  // SSS havuzundan bir soruya tıklanınca AI'ye tekrar sormaya gerek yok —
  // destek ekibinin verdiği cevap doğrudan gösterilir.
  const askFromFaq = (faq) => {
    setHistory((h_) => [
      ...h_,
      {
        question: faq.question,
        answer: faq.answer,
        sources: [],
        needs_human: false,
        fromFaq: true,
        ticket_id: null,
      },
    ]);
  };

  const markNegative = (index) => {
    setHistory((h_) => h_.map((item, i) => (i === index ? { ...item, forced_human: true } : item)));
  };

  const seeds = FAQ_SUGGESTIONS[competition.id] || GENERIC_SUGGESTIONS;
  // SSS havuzu büyüdükçe (yarışma başına 50+ kayıt) liste bir duvara dönüşüyordu.
  const FAQ_PREVIEW = 6;
  const shownFaqs = showAllFaqs ? faqs : faqs.slice(0, FAQ_PREVIEW);

  return h(
    "div",
    { className: "space-y-4" },
    h(
      Card,
      { className: "p-5" },
      h(
        "div",
        { className: "flex items-center gap-2 mb-3" },
        h("span", {
          className: "w-2 h-2 rounded-full",
          style: { backgroundColor: BRAND.green, boxShadow: `0 0 0 3px ${BRAND.green}25` },
        }),
        h(
          "p",
          { className: "text-[13px] font-semibold", style: { color: BRAND.navyMid } },
          "Sorunuzu yazın — Cevap sadece güvenilir kaynaklardan verilir."
        )
      ),
      h(
        "div",
        { className: "flex gap-2 mb-3.5" },
        h("input", {
          className:
            "flex-1 border border-slate-300 rounded px-3.5 py-2.5 text-sm focus:outline-none " +
            "focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
          placeholder: `Örn: ${seeds[0]}`,
          value: question,
          onChange: (e) => setQuestion(e.target.value),
          onKeyDown: (e) => e.key === "Enter" && ask(),
        }),
        h(
          "button",
          {
            className: CTA_CLASS + " text-xs px-5 py-2.5",
            style: { backgroundColor: BRAND.red },
            onMouseEnter: (e) => !loading && (e.currentTarget.style.backgroundColor = BRAND.redLight),
            onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = BRAND.red),
            onClick: () => ask(),
            disabled: loading,
          },
          loading ? "Soruluyor..." : "Sor"
        )
      ),
      h(
        "div",
        { className: "flex flex-wrap gap-1.5" },
        seeds.map((s, i) =>
          h(
            "button",
            {
              key: "seed-" + i,
              className:
                "text-[11.5px] px-2.5 py-1.5 rounded border border-slate-200 text-slate-600 " +
                "hover:border-[#ca310a] hover:text-[#ca310a] hover:bg-orange-50/50 transition-colors " +
                "disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-600 disabled:cursor-not-allowed",
              onClick: () => ask(s),
              disabled: loading,
            },
            s
          )
        )
      )
    ),
    h(
      "div",
      { className: "space-y-3", ref: historyRef },
      loading &&
        h(
          Card,
          { className: "p-5", accent: BRAND.blue },
          h(
            "div",
            { className: "flex items-center gap-3" },
            h("span", {
              className: "w-6 h-6 rounded-full border-2 border-slate-200 animate-spin",
              style: { borderTopColor: BRAND.blue },
            }),
            h(
              "div",
              null,
              h("p", { className: "text-sm font-semibold", style: { color: BRAND.navy } }, "Kaynaklar taranıyor…"),
              h(
                "p",
                { className: "text-xs text-slate-500 mt-0.5" },
                "Sorunuz anlamsal olarak eşleştiriliyor, cevap yalnızca bulunan kaynak parçalarından yazılacak."
              )
            )
          )
        ),
      history
        .slice()
        .reverse()
        .map((item, revIdx) => {
          const i = history.length - 1 - revIdx;
          const canEscalate = (item.needs_human || item.forced_human) && !item.out_of_scope;
          const showItiraz = canEscalate && openForms[i];
          const accent = item.out_of_scope
            ? "#7b8794"
            : item.needs_human
            ? BRAND.yellow
            : item.error
            ? BRAND.red
            : BRAND.blue;
          return h(
            Card,
            { key: i, className: "p-5", accent },
            h(
              "div",
              { className: "flex gap-2.5 mb-3" },
              h(
                "span",
                {
                  className: "shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white",
                  style: { backgroundColor: BRAND.navyMid },
                },
                "S"
              ),
              h("p", { className: "text-sm font-semibold leading-snug", style: { color: BRAND.navy } }, item.question)
            ),
            h(
              "div",
              { className: "flex gap-2.5" },
              h(
                "span",
                {
                  className: "shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-white",
                  style: { backgroundColor: accent },
                },
                h(Icon, { name: item.out_of_scope ? "star" : item.needs_human ? "star" : "rocket", size: 13 })
              ),
              h("p", { className: "text-sm text-slate-700 whitespace-pre-wrap leading-relaxed flex-1" }, item.answer)
            ),
            h(
              "div",
              { className: "flex flex-wrap gap-2 items-center mt-3 pl-[34px]" },
              item.out_of_scope
                ? h(Badge, { tone: "slate" }, item.reason === "yanlis_yarisma" ? "Farklı yarışma" : "Kapsam dışı")
                : item.from_faq
                ? h(Badge, { tone: "green" }, "Daha önce sorulmuştu — ekip onaylı")
                : item.fromFaq
                ? h(Badge, { tone: "green" }, "SSS havuzundan (ekip yanıtı)")
                : item.needs_human
                ? h(Badge, { tone: "amber" }, "Uzmana yönlendirildi")
                : h(Badge, { tone: "green" }, "AI cevabı"),
              item.takip && h(Badge, { tone: "blue" }, "Önceki soruya bağlı"),
              // Emin olunamayan (insana yönlendirilen) cevaplarda güven skoru
              // GÖSTERİLMEZ — alakasız/rastgele bir sayı vermek yanıltıcı olurdu.
              !item.needs_human &&
                !item.out_of_scope &&
                typeof item.confidence === "number" &&
                h(
                  Badge,
                  { tone: "slate" },
                  `Kaynak eşleşmesi: ${
                    item.confidence >= 0.65 ? "yüksek" : item.confidence >= 0.55 ? "orta" : "sınırlı"
                  } (%${(item.confidence * 100).toFixed(0)})`
                )
            ),
            // Kaynaklar SADECE gerçek bir AI cevabı verildiğinde gösterilir.
            // Soru anlaşılamayıp insana yönlendirildiğinde, o sorguya en yakın
            // (ama alakasız olabilecek) parçaları "kaynak" diye göstermek
            // yanıltıcıydı — artık sadece güvenilir eşiği geçen cevaplarda çıkar.
            item.from_faq &&
              item.matched_question &&
              h(
                "p",
                { className: "text-[11.5px] text-emerald-800 mt-2 pl-[34px]" },
                `Eşleşen soru: “${item.matched_question}”`
              ),
            !item.needs_human &&
              !item.out_of_scope &&
              h(SourceBadges, { sources: item.sources, ilgili: item.sources_ilgili }),
            !item.needs_human &&
              !item.error &&
              !item.out_of_scope &&
              item.ticket_id &&
              h(
                "div",
                { className: "mt-2" },
                h(FeedbackButtons, { ticketId: item.ticket_id, onNegative: () => markNegative(i) })
              ),
            canEscalate &&
              !openForms[i] &&
              h(
                "div",
                { className: "mt-3 pl-[34px]" },
                h(
                  "button",
                  {
                    className:
                      "text-[12px] font-semibold border rounded px-3.5 py-2 transition-colors " +
                      "border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100",
                    onClick: () => setOpenForms((o) => ({ ...o, [i]: true })),
                  },
                  "Bu soruyu uzmana ilet →"
                )
              ),
            showItiraz &&
              h(ItirazForm, {
                competition,
                prefillQuestion: item.question,
                relatedTicketId: item.ticket_id,
                currentUser,
                reason: item.needs_human ? "no_match" : "feedback",
              })
          );
        })
    ),
    faqs.length > 0 &&
      h(
        Card,
        { className: "p-5", accent: BRAND.green },
        h(
          "div",
          { className: "flex items-center gap-2 mb-1" },
          h(
            "h3",
            { className: "text-[11px] font-bold uppercase tracking-wider", style: { color: BRAND.navyMid } },
            "Sık Sorulan Sorular"
          ),
          h(Badge, { tone: "green" }, "Ekip onaylı")
        ),
        h(
          "p",
          { className: "text-xs text-slate-500 mb-3" },
          "Bu yanıtlar destek ekibi tarafından onaylandı."
        ),
        h(
          "div",
          { className: "grid grid-cols-1 sm:grid-cols-2 gap-2" },
          shownFaqs.map((f) =>
            h(
              "button",
              {
                key: f.id,
                className:
                  "text-left text-[12.5px] px-3 py-2.5 rounded border border-emerald-200 text-emerald-900 " +
                  "bg-emerald-50/60 hover:bg-emerald-50 hover:border-emerald-400 transition-colors leading-snug",
                onClick: () => askFromFaq(f),
              },
              f.question
            )
          )
        ),
        faqs.length > FAQ_PREVIEW &&
          h(
            "button",
            {
              className: "mt-3 text-[12px] font-bold uppercase tracking-wider text-emerald-800 hover:text-emerald-900",
              onClick: () => setShowAllFaqs((v) => !v),
            },
            showAllFaqs ? "▴ Daha az göster" : `▾ Tümünü göster (${faqs.length})`
          )
      )
  );
}

// --- "Talebimi Sorgula" ekranı ----------------------------------------------
function TrackScreen({ onBack }) {
  const [ticketId, setTicketId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [applicationId, setApplicationId] = useState("");
  const [results, setResults] = useState(null);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState("");

  const search = async () => {
    const tId = ticketId.trim();
    const tmId = teamId.trim();
    const appId = applicationId.trim();
    if (!tId && !tmId && !appId) {
      setSearchError("Talep numarası veya Takım ID / Başvuru ID girmelisiniz.");
      setSearched(false);
      return;
    }
    setSearchError("");
    const params = new URLSearchParams();
    if (tId) params.set("ticket_id", tId);
    if (tmId) params.set("team_id", tmId);
    if (appId) params.set("application_id", appId);
    // ÖNEMLİ: bu fetch daha önce try/catch içinde DEĞİLDİ — bir ağ hatası
    // olduğunda sessizce hiçbir şey göstermeden çöküyordu (bildirilen "hiçbir
    // uyarı vermiyor" hatası tam olarak buydu). Artık her durumda bir sonuç
    // gösteriliyor.
    try {
      const res = await fetch(`/api/my-tickets?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setSearchError(data.error || `Sunucu hatası (${res.status}).`);
        setSearched(false);
        return;
      }
      setResults(data.tickets || []);
      setSearched(true);
    } catch (err) {
      setSearchError("Sunucuya ulaşılamadı, lütfen tekrar deneyin.");
      setSearched(false);
    }
  };

  const TrackField = (label, node) =>
    h(
      "div",
      null,
      h("label", { className: "text-xs font-medium text-slate-600 mb-1 block" }, label),
      node
    );

  const statusLabel = {
    ai_cevapladi: "AI tarafından cevaplandı",
    insana_yonlendirildi: "İncelemede",
    atandi: "Bir yetkiliye atandı",
    cevaplandi: "Cevaplandı",
    kapatildi: "Kapatıldı",
  };

  return h(
    PageShell,
    {
      hero: h(PageHero, {
        title: "Talebimi Sorgula",
        subtitle: "Talep numaranızı (örn. #3) veya Takım ID + Başvuru ID ikilinizi girin.",
        onBack,
      }),
    },
    h(
      "div",
      { className: "bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-2", style: { boxShadow: `0 0 0 1.5px ${BRAND.blue}22` } },
      // Alan adları kalıcı etiket olarak üstte duruyor — placeholder olarak
      // yazıldığında yazmaya başlayınca kaybolup hangi alan olduğu
      // anlaşılmıyordu.
      TrackField(
        "Talep numarası (opsiyonel)",
        h("input", {
          className: "w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
          placeholder: "örn. 3",
          value: ticketId,
          onChange: (e) => setTicketId(e.target.value),
        })
      ),
      h(
        "div",
        { className: "grid grid-cols-2 gap-2" },
        TrackField(
          "Takım ID",
          h("input", {
            className: "w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
            value: teamId,
            onChange: (e) => setTeamId(e.target.value),
          })
        ),
        TrackField(
          "Başvuru ID",
          h("input", {
            className: "w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
            value: applicationId,
            onChange: (e) => setApplicationId(e.target.value),
          })
        )
      ),
      h(
        "button",
        {
          className: CTA_CLASS + " text-xs px-5 py-2.5",
          style: { backgroundColor: BRAND.red },
          onMouseEnter: (e) => (e.currentTarget.style.backgroundColor = BRAND.redLight),
          onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = BRAND.red),
          onClick: search,
        },
        "Sorgula"
      ),
      searchError &&
        h(
          "div",
          { className: "flex items-start gap-2 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 font-medium" },
          h("span", { className: "shrink-0 font-bold" }, "!"),
          searchError
        )
    ),
    searched &&
      h(
        "div",
        { className: "space-y-2" },
        // Not: önceden bu mesaj küçük gri bir yazıydı, kolayca fark edilmiyordu —
        // artık belirgin, renkli bir uyarı kutusu.
        results.length === 0 &&
          h(
            "div",
            { className: "p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 font-medium" },
            "Bu numara/ID ile eşleşen bir talep bulunamadı. Lütfen numarayı kontrol edin."
          ),
        results.map((t) =>
          h(
            "div",
            { key: t.id, className: "bg-white rounded-lg border border-slate-200 shadow-[0_1px_3px_rgba(0,27,72,0.06)] p-4 space-y-1" },
            h(
              "div",
              { className: "flex gap-2 items-center flex-wrap" },
              h(Badge, { tone: t.type === "itiraz" ? "red" : "slate" }, t.type === "itiraz" ? "İtiraz" : "Soru"),
              h(Badge, { tone: "amber" }, statusLabel[t.status] || t.status),
              h("span", { className: "text-xs text-slate-400" }, `#${t.id} · ${fmtDate(t.created_at)}`)
            ),
            h("p", { className: "text-sm font-medium" }, t.question),
            t.human_answer && h("p", { className: "text-sm text-emerald-700" }, "Yanıt: " + t.human_answer)
          )
        )
      )
  );
}

// --- Hakem / koordinatör paneli ---------------------------------------------
// ---------------------------------------------------------------------------
// SORULARIM — giriş yapmış yarışmacının kendi soruları.
// Talep Sorgula ekranından farkı: takım/başvuru numarası sormaz, kimlik
// token'dan gelir. Giriş yapılmadığında bu ekran yerine Talep Sorgula açılır.
// ---------------------------------------------------------------------------
function SorularimScreen({ token, onBack }) {
  const [tickets, setTickets] = useState(null);
  const [hata, setHata] = useState("");

  useEffect(() => {
    fetch("/api/sorularim", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        const metin = await r.text();
        let d = null;
        try {
          d = JSON.parse(metin);
        } catch (_) {}
        if (!r.ok) throw new Error((d && d.error) || `Sorular alınamadı (HTTP ${r.status}).`);
        return d;
      })
      .then((d) => setTickets((d && d.tickets) || []))
      .catch((e) => setHata(e.message));
  }, [token]);

  const DURUM = {
    ai_cevapladi: { ad: "AI cevapladı", tone: "green" },
    insana_yonlendirildi: { ad: "İncelemede", tone: "amber" },
    atandi: { ad: "Bir yetkiliye atandı", tone: "blue" },
    cevaplandi: { ad: "Cevaplandı", tone: "green" },
    kapatildi: { ad: "Kapatıldı", tone: "slate" },
  };

  return h(
    PageShell,
    {
      hero: h(PageHero, {
        title: "Sorularım",
        subtitle: "Sorduğunuz sorular ve uzmana ilettiğiniz taleplerin durumu",
        onBack,
      }),
    },
    hata &&
      h(
        "div",
        { className: "p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 font-medium" },
        hata
      ),
    !hata && tickets === null && h("p", { className: "text-sm text-slate-400" }, "Yükleniyor..."),
    tickets &&
      tickets.length === 0 &&
      h(
        Card,
        { className: "p-8 text-center" },
        h(
          "p",
          { className: "text-sm text-slate-400" },
          "Henüz bir sorunuz yok. Ana sayfadan bir yarışma seçip soru sorduğunuzda burada listelenir."
        )
      ),
    tickets &&
      tickets.map((t) =>
        h(
          Card,
          { key: t.id, className: "p-5 space-y-2.5" },
          h(
            "div",
            { className: "flex items-center gap-2 flex-wrap" },
            h(Badge, { tone: (DURUM[t.status] && DURUM[t.status].tone) || "slate" }, (DURUM[t.status] && DURUM[t.status].ad) || t.status),
            t.category &&
              h(Badge, { tone: "navy" }, COMPETITIONS.find((c) => c.id === t.category)?.name || t.category),
            h("div", { className: "flex-1" }),
            h("span", { className: "text-[11px] text-slate-400" }, `#${t.id} · ${fmtDate(t.created_at)}`)
          ),
          h("p", { className: "text-sm font-semibold", style: { color: BRAND.navy } }, t.question),
          t.human_answer
            ? h(
                "div",
                { className: "rounded bg-emerald-50 border border-emerald-200 p-3" },
                h(
                  "p",
                  { className: "text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1" },
                  "Uzman cevabı"
                ),
                h("p", { className: "text-sm text-emerald-900 leading-relaxed" }, t.human_answer)
              )
            : t.ai_answer
            ? h(
                "div",
                { className: "rounded bg-slate-50 border border-slate-200 p-3" },
                h(
                  "p",
                  { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1" },
                  "AI cevabı"
                ),
                h("p", { className: "text-[13px] text-slate-600 leading-relaxed" }, t.ai_answer)
              )
            : h(
                "p",
                { className: "text-[13px] text-slate-500" },
                "Talebiniz sırada — bir uzman inceledikten sonra cevabı burada görünecek."
              )
        )
      )
  );
}

function StaffPanel({ currentUser, token, onLogout }) {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("");
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [promoted, setPromoted] = useState({});
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [yetkili, setYetkili] = useState(null);
  const [compFilter, setCompFilter] = useState("");
  const [benzer, setBenzer] = useState({});
  const [editing, setEditing] = useState({});
  // Silme iki adımlı: tarayıcı diyaloğu yerine kartın içinde onay istiyoruz,
  // böylece yanlışlıkla tek tıkla veri kaybı olmuyor.
  const [silAdayi, setSilAdayi] = useState(null);
  const [silHata, setSilHata] = useState("");
  const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const sil = async (id) => {
    setSilHata("");
    try {
      const r = await fetch(`/api/tickets/${id}`, { method: "DELETE", headers: authHeaders });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `Silinemedi (HTTP ${r.status}).`);
      }
      setSilAdayi(null);
      load();
    } catch (e) {
      setSilHata(e.message);
    }
  };


  const load = useCallback(() => {
    const qs = [];
    if (filter) qs.push(`status=${encodeURIComponent(filter)}`);
    if (compFilter) qs.push(`competition=${encodeURIComponent(compFilter)}`);
    const url = qs.length ? `/api/tickets?${qs.join("&")}` : "/api/tickets";
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.status === 401 ? (onLogout(), { tickets: [] }) : r.json()))
      .then((d) => {
        setTickets(d.tickets || []);
        setYetkili(d.yetkili_yarismalar || null);
        setLoadError(d.error || "");
        setLoaded(true);
        // Her talep için "daha önce benzeri sorulmuş mu" bağlamını çek.
        (d.tickets || []).slice(0, 12).forEach((t) => {
          fetch(`/api/tickets/${t.id}/benzer`, { headers: { Authorization: `Bearer ${token}` } })
            .then((r) => (r.ok ? r.json() : null))
            .then((b) => b && setBenzer((prev) => ({ ...prev, [t.id]: b })))
            .catch(() => {});
        });
      })
      .catch((err) => {
        setLoadError("Talepler yüklenemedi: " + err.message);
        setLoaded(true);
      });
  }, [filter, compFilter, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Aksiyonların hepsi eskiden "ateşle ve unut" idi: 401/403 dönse bile ekranda
  // hiçbir şey olmuyordu. Artık yanıt kontrol ediliyor ve hata gösteriliyor.
  const runAction = async (url, opts) => {
    try {
      const res = await fetch(url, opts);
      if (!res.ok) {
        let msg = `İşlem başarısız (HTTP ${res.status}).`;
        try {
          const b = await res.json();
          if (b && b.error) msg = b.error;
        } catch {}
        if (res.status === 401) msg = "Oturumunuz doldu. Lütfen tekrar giriş yapın.";
        setLoadError(msg);
        return false;
      }
      setLoadError("");
      return true;
    } catch {
      setLoadError("Sunucuya ulaşılamadı.");
      return false;
    }
  };

  const answer = async (id) => {
    const human_answer = answerDrafts[id];
    if (!human_answer) return;
    const ok = await runAction(`/api/tickets/${id}/answer`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ human_answer }),
    });
    if (ok) {
      setEditing((e) => ({ ...e, [id]: false }));
      load();
    }
  };

  const assignToMe = async (id) => {
    const ok = await runAction(`/api/tickets/${id}/assign`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ assigned_to: currentUser?.id }),
    });
    if (ok) load();
  };

  const promoteToFaq = async (id) => {
    const ok = await runAction(`/api/tickets/${id}/promote-to-faq`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (ok) setPromoted((p) => ({ ...p, [id]: true }));
  };

  const STATUS_META = {
    insana_yonlendirildi: { label: "İncelemede", tone: "amber" },
    atandi: { label: "Atandı", tone: "navy" },
    cevaplandi: { label: "Cevaplandı", tone: "green" },
    ai_cevapladi: { label: "AI cevapladı", tone: "slate" },
    kapatildi: { label: "Kapatıldı", tone: "slate" },
  };

  const FILTERS = [
    { value: "", label: "Tümü" },
    { value: "insana_yonlendirildi", label: "Bekleyen" },
    { value: "atandi", label: "Atanan" },
    { value: "cevaplandi", label: "Cevaplanan" },
  ];

  const bekleyen = tickets.filter((t) => t.status === "insana_yonlendirildi").length;

  return h(
    PageShell,
    {
      hero: h(PageHero, {
        title: "Hakem / Koordinatör Paneli",
        subtitle:
          yetkili && yetkili.length
            ? `${currentUser.name} — sorumlu olduğunuz yarışmalar: ` +
              yetkili.map((id) => COMPETITIONS.find((c) => c.id === id)?.name || id).join(", ")
            : `${currentUser.name} — tüm yarışmalardan gelen ve uzman görüşü bekleyen talepler`,
      }),
    },
    // Yarışma sekmeleri: talep havuzu yarışmaya göre ayrılır.
    (() => {
      const idler =
        yetkili && yetkili.length
          ? yetkili
          : Array.from(new Set(tickets.map((t) => t.category).filter(Boolean)));
      if (idler.length < 2) return null;
      return h(
        "div",
        { className: "flex flex-wrap items-center gap-2" },
        h(
          "span",
          { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1" },
          "Yarışma"
        ),
        [{ id: "", ad: "Hepsi" }]
          .concat(idler.map((id) => ({ id, ad: COMPETITIONS.find((c) => c.id === id)?.name || id })))
          .map((o) =>
            h(
              "button",
              {
                key: o.id || "hepsi",
                className:
                  "text-[12px] font-semibold px-3 py-1.5 rounded border transition-colors " +
                  (compFilter === o.id
                    ? "text-white border-transparent"
                    : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"),
                style: compFilter === o.id ? { backgroundColor: BRAND.navyMid } : undefined,
                onClick: () => setCompFilter(o.id),
              },
              o.ad
            )
          )
      );
    })(),
    // Filtre sekmeleri (açılır menü yerine) + bekleyen sayacı
    h(
      "div",
      { className: "flex flex-wrap items-center gap-2" },
      FILTERS.map((f) =>
        h(
          "button",
          {
            key: f.value || "all",
            onClick: () => setFilter(f.value),
            className:
              "text-[12px] font-semibold px-3 py-1.5 rounded border transition-colors " +
              (filter === f.value
                ? "text-white border-transparent"
                : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"),
            style: filter === f.value ? { backgroundColor: BRAND.navyMid } : undefined,
          },
          f.label
        )
      ),
      h("div", { className: "flex-1" }),
      bekleyen > 0 &&
        h(
          "span",
          { className: "text-[12px] font-bold px-3 py-1.5 rounded text-white", style: { backgroundColor: BRAND.red } },
          `${bekleyen} talep bekliyor`
        ),
      h(
        "button",
        {
          className: "text-[12px] font-semibold px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:border-slate-400",
          onClick: load,
        },
        "Yenile"
      )
    ),
    tickets.map((t) => {
      const meta = STATUS_META[t.status] || { label: t.status, tone: "slate" };
      const accent = t.type === "itiraz" ? BRAND.red : t.status === "cevaplandi" ? BRAND.green : BRAND.yellow;
      return h(
        Card,
        { key: t.id, className: "p-5 space-y-3", accent },
        // üst satır: durum rozetleri + kimlik bilgileri
        h(
          "div",
          { className: "flex gap-2 items-center flex-wrap" },
          h(Badge, { tone: t.type === "itiraz" ? "red" : "slate" }, t.type === "itiraz" ? "İtiraz" : "Soru"),
          h(Badge, { tone: meta.tone }, meta.label),
          t.category && h(Badge, { tone: "navy" }, COMPETITIONS.find((c) => c.id === t.category)?.name || t.category),
          t.helpful === 0 && h(Badge, { tone: "red" }, "Yarışmacı memnun kalmadı"),
          h("div", { className: "flex-1" }),
          h("span", { className: "text-[11px] text-slate-400 font-medium" }, `#${t.id} · ${fmtDate(t.created_at)}`)
        ),
        (t.team_id || t.application_id) &&
          h(
            "div",
            { className: "flex gap-2 flex-wrap" },
            t.team_id && h(Badge, { tone: "navy" }, `Takım ID: ${t.team_id}`),
            t.application_id && h(Badge, { tone: "navy" }, `Başvuru ID: ${t.application_id}`)
          ),
        // yarışmacının sorusu
        h(
          "div",
          null,
          h("p", { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1" }, "Yarışmacının sorusu"),
          h("p", { className: "text-sm font-semibold", style: { color: BRAND.navy } }, t.question)
        ),
        t.decision_reason &&
          h(
            "div",
            null,
            h("p", { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1" }, "Yarışmacının eklediği"),
            h("p", { className: "text-sm text-slate-600" }, t.decision_reason)
          ),
        t.ai_answer &&
          h(
            "div",
            { className: "rounded bg-slate-50 border border-slate-200 p-3" },
            h("p", { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1" }, "AI ne demişti"),
            h("p", { className: "text-[13px] text-slate-600 leading-relaxed" }, t.ai_answer)
          ),
        // Daha önce benzeri sorulmuş mu? Hakem cevap yazmadan önce görsün.
        benzer[t.id] &&
          (benzer[t.id].benzerler || []).length > 0 &&
          h(
            "div",
            { className: "rounded bg-blue-50 border border-blue-200 p-3 space-y-1.5" },
            h(
              "p",
              { className: "text-[11px] font-bold uppercase tracking-wider text-blue-700" },
              (benzer[t.id].tekrar_sayisi || 0) >= 2
                ? `Bu soru daha önce ${benzer[t.id].tekrar_sayisi} kez soruldu — SSS havuzuna almaya değer`
                : "Daha önce benzer sorulmuş"
            ),
            (benzer[t.id].benzerler || []).map((b) =>
              h(
                "div",
                { key: b.id, className: "text-[12.5px] text-blue-900 leading-snug" },
                h("span", { className: "font-semibold" }, `#${b.id} `),
                b.ayni_takim ? h(Badge, { tone: "navy" }, "aynı takım") : null,
                " ",
                b.question,
                b.human_answer
                  ? h("div", { className: "text-[12px] text-blue-800/80 mt-0.5" }, "→ " + b.human_answer)
                  : null
              )
            )
          ),
        t.human_answer && !editing[t.id]
          ? h(
              "div",
              { className: "rounded bg-emerald-50 border border-emerald-200 p-3 space-y-2" },
              h("p", { className: "text-[11px] font-bold uppercase tracking-wider text-emerald-600" }, "Verilen cevap"),
              h("p", { className: "text-sm text-emerald-900 leading-relaxed" }, t.human_answer),
              promoted[t.id]
                ? h(Badge, { tone: "green" }, "SSS havuzuna eklendi")
                : h(
                    "div",
                    { className: "flex gap-2" },
                    h(
                      "button",
                      {
                        className:
                          "text-[12px] font-semibold border border-emerald-400 text-emerald-800 px-3 py-1.5 rounded hover:bg-emerald-100 transition-colors",
                        onClick: () => promoteToFaq(t.id),
                      },
                      "+ SSS havuzuna ekle"
                    ),
                    h(
                      "button",
                      {
                        className:
                          "text-[12px] font-semibold border border-slate-300 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-100 transition-colors",
                        onClick: () => {
                          setAnswerDrafts((d) => ({ ...d, [t.id]: t.human_answer }));
                          setEditing((e) => ({ ...e, [t.id]: true }));
                        },
                      },
                      "Düzenle"
                    )
                  )
            )
          : h(
              "div",
              { className: "space-y-2" },
              h(
                "label",
                { className: "text-[11px] font-bold uppercase tracking-wider text-slate-400 block" },
                "Cevabınız"
              ),
              h("textarea", {
                className:
                  "w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none " +
                  "focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
                rows: 3,
                placeholder: "Yarışmacıya iletilecek cevabı yazın...",
                value: answerDrafts[t.id] || "",
                onChange: (e) => setAnswerDrafts((d) => ({ ...d, [t.id]: e.target.value })),
              }),
              h(
                "div",
                { className: "flex gap-2" },
                h(
                  "button",
                  {
                    className: CTA_CLASS + " text-[11px] px-4 py-2",
                    style: { backgroundColor: BRAND.red },
                    onMouseEnter: (e) => (e.currentTarget.style.backgroundColor = BRAND.redLight),
                    onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = BRAND.red),
                    onClick: () => answer(t.id),
                  },
                  "Cevabı Gönder"
                ),
                h(
                  "button",
                  {
                    className: "text-[12px] font-semibold border border-slate-300 px-3 py-2 rounded hover:bg-slate-50 transition-colors",
                    onClick: () => assignToMe(t.id),
                  },
                  "Bana ata"
                )
              )
            ),
        // --- Talebi sil ---------------------------------------------------
        h(
          "div",
          { className: "pt-2 border-t border-slate-100 flex items-center gap-2 flex-wrap" },
          silAdayi === t.id
            ? h(
                "div",
                { className: "flex items-center gap-2 flex-wrap" },
                h(
                  "span",
                  { className: "text-[12px] text-slate-600" },
                  `#${t.id} kalıcı olarak silinsin mi? Geri alınamaz.`
                ),
                h(
                  "button",
                  {
                    className:
                      "text-[12px] font-bold text-white px-3 py-1.5 rounded transition-colors",
                    style: { backgroundColor: BRAND.red },
                    onClick: () => sil(t.id),
                  },
                  "Evet, sil"
                ),
                h(
                  "button",
                  {
                    className:
                      "text-[12px] font-semibold border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors",
                    onClick: () => {
                      setSilAdayi(null);
                      setSilHata("");
                    },
                  },
                  "Vazgeç"
                )
              )
            : h(
                "button",
                {
                  className:
                    "text-[12px] font-semibold text-slate-400 hover:text-red-700 transition-colors",
                  onClick: () => {
                    setSilHata("");
                    setSilAdayi(t.id);
                  },
                },
                "Talebi sil"
              ),
          silAdayi === t.id && silHata
            ? h("span", { className: "text-[12px] text-red-700" }, silHata)
            : null
        )
      );
    }),
    loadError &&
      h(
        "div",
        { className: "p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 font-medium" },
        loadError
      ),
    !loadError &&
      tickets.length === 0 &&
      h(
        Card,
        { className: "p-8 text-center" },
        h(
          "p",
          { className: "text-sm text-slate-400" },
          loaded
            ? yetkili && yetkili.length
              ? "Sorumlu olduğunuz yarışmalarda bu filtreye uyan talep yok."
              : "Bu filtrede talep yok."
            : "Talepler yükleniyor…"
        )
      )
  );
}

// --- Staff girişi: gerçek ID (e-posta) + şifre login paneli ------------------
function StaffLoginBar({ currentUser, onLogin, onLogout }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ROLE_LABEL = {
    hakem: "Hakem",
    koordinator: "Koordinatör",
    admin: "Sistem Yöneticisi",
    icerik_yoneticisi: "İçerik Yöneticisi",
    yarisci: "Yarışmacı",
  };

  if (currentUser) {
    return h(
      "div",
      { className: "flex items-center gap-2.5 shrink-0" },
      h(
        "div",
        { className: "text-right leading-tight hidden sm:block" },
        h("div", { className: "text-white text-[12px] font-semibold" }, currentUser.name),
        h(
          "div",
          { className: "text-white/45 text-[10px] uppercase tracking-wider" },
          ROLE_LABEL[currentUser.role] || currentUser.role
        )
      ),
      h(
        "button",
        {
          className: "text-white/70 text-[11px] font-bold uppercase tracking-wider border border-white/25 rounded px-2.5 py-1.5 hover:bg-white/10 transition-colors",
          onClick: onLogout,
        },
        "Çıkış"
      )
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    let res;
    try {
      res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    } catch (err) {
      // Gerçek ağ hatası (sunucuya hiç ulaşılamadı) — bağlantı/CORS sorunu.
      setError("Sunucuya ulaşılamadı: " + err.message);
      setBusy(false);
      return;
    }
    let data;
    try {
      data = await res.json();
    } catch (err) {
      // Sunucu JSON dışı bir şey döndürdü (ör. 500 hata sayfası) — önceden
      // bu durum sessizce "Sunucuya ulaşılamadı" olarak gösteriliyordu ve
      // gerçek nedeni gizliyordu.
      setError(`Sunucu beklenmeyen bir yanıt döndü (HTTP ${res.status}).`);
      setBusy(false);
      return;
    }
    if (!res.ok) {
      setError(data.error || `Giriş başarısız (HTTP ${res.status}).`);
      setBusy(false);
      return;
    }
    onLogin(data.user, data.token);
    setOpen(false);
    setEmail("");
    setPassword("");
    setBusy(false);
  };

  return h(
    "div",
    { className: "relative shrink-0" },
    // teknofest.org'un turuncu "GİRİŞ YAP" butonunun aynısı
    h(
      "button",
      {
        className: CTA_CLASS + " text-[11px] px-3.5 py-2",
        style: { backgroundColor: open ? BRAND.redLight : BRAND.red },
        onMouseEnter: (e) => (e.currentTarget.style.backgroundColor = BRAND.redLight),
        onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = open ? BRAND.redLight : BRAND.red),
        onClick: () => setOpen((o) => !o),
      },
      "Giriş Yap",
      h(Icon, { name: "rocket", size: 13 })
    ),
    open &&
      h(
        "form",
        {
          className: "absolute right-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-2xl p-4 z-30 w-72 space-y-2.5 text-left",
          onSubmit: submit,
        },
        h(
          "p",
          { className: "text-[11px] font-bold uppercase tracking-wider mb-1", style: { color: BRAND.navyMid } },
          "Giriş"
        ),
        h(
          "p",
          { className: "text-[11px] text-slate-500 -mt-1 mb-1 leading-snug" },
          "Yarışmacı hesabıyla girerseniz sorularınızı takip edebilirsiniz; ekip hesapları kendi paneline gider."
        ),
        h(
          "div",
          null,
          h("label", { className: "text-[11px] font-medium text-slate-600 mb-1 block" }, "E-posta"),
          h("input", {
            className: "w-full border border-slate-300 rounded px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
            placeholder: "örn. yarisci@demo.t3",
            value: email,
            onChange: (e) => setEmail(e.target.value),
          })
        ),
        h(
          "div",
          null,
          h("label", { className: "text-[11px] font-medium text-slate-600 mb-1 block" }, "Şifre"),
          h("input", {
            className: "w-full border border-slate-300 rounded px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
            placeholder: "••••••••",
            type: "password",
            value: password,
            onChange: (e) => setPassword(e.target.value),
          })
        ),
        error &&
          h(
            "p",
            { className: "text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 leading-snug" },
            error
          ),
        h(
          "button",
          {
            type: "submit",
            disabled: busy,
            className: CTA_CLASS + " w-full text-[11px] px-3 py-2.5",
            style: { backgroundColor: BRAND.red },
          },
          busy ? "Giriş yapılıyor..." : "Giriş Yap"
        )
      )
  );
}

// --- İçerik Yöneticisi paneli: belge yükleme, AKIŞ 02 (eski kaynağı pasife
// alma), kaynak listesi + geçerlilik (aktif/pasif) durumu -------------------
function DocumentManager({ currentUser, token, onLogout }) {
  const [documents, setDocuments] = useState([]);
  const [competitionId, setCompetitionId] = useState("iha");
  const [title, setTitle] = useState("");
  const [version, setVersion] = useState("");
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  // <input type="file"> kontrolsüz bir eleman: setFile(null) yapmak ekranda
  // görünen dosya adını temizlemiyor. key değişince input yeniden oluşuyor.
  const [fileInputKey, setFileInputKey] = useState(0);
  // Ham PDF bağlama (kaynak rozetine tıklanınca açılacak dosya)
  const [kBaslik, setKBaslik] = useState("");
  const [kDosya, setKDosya] = useState(null);
  const [kDurum, setKDurum] = useState("");
  const [kKey, setKKey] = useState(0);
  const authHeader = { Authorization: `Bearer ${token}` };

  // Çevrimdışı hazırlanan İHA kaynaklarının başlıkları arayüzde başka yerde
  // geçmiyor; bağlama formunda yazım hatası olmasın diye öneri olarak sunuyoruz.
  const BILINEN_BASLIKLAR = [
    "İHA Yarışmaları Şartnamesi 2026",
    "Sabit-Döner Kanat Görev Videosu Hazırlama Kılavuzu",
    "Serbest Görev Kategorisi Görev Videosu Hazırlama Kılavuzu",
    "Sabit-Döner PSR Hazırlama Kılavuzu",
    "Serbest Görev PSR Hazırlama Kılavuzu",
  ];

  const kaynakBagla = async (e) => {
    e.preventDefault();
    setKDurum("");
    if (!kDosya || !kBaslik.trim()) {
      setKDurum("Kaynak başlığı ve PDF gerekli.");
      return;
    }
    const fd = new FormData();
    fd.append("file", kDosya);
    fd.append("source_title", kBaslik.trim());
    fd.append("competition_id", competitionId);
    try {
      const r = await fetch("/api/admin/kaynak-dosyasi", { method: "POST", headers: authHeader, body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Yükleme başarısız.");
      // Rozetlerin anında bağlantıya dönmesi için önbelleği tazele.
      KAYNAK_BASLIK_KUMESI = null;
      setKDurum(`"${d.source_title}" bağlandı — bu kaynağın rozetleri artık tıklanabilir.`);
      setKBaslik("");
      setKDosya(null);
      setKKey((k) => k + 1);
    } catch (err) {
      setKDurum("Hata: " + err.message);
    }
  };

  const load = useCallback(() => {
    fetch("/api/admin/documents", { headers: authHeader })
      .then((r) => (r.status === 401 ? (onLogout(), { documents: [] }) : r.json()))
      .then((d) => setDocuments(d.documents || []))
      .catch(() => setDocuments([]));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const upload = async (e) => {
    e.preventDefault();
    setError("");
    if (!file || !title) {
      setError("Dosya ve başlık gerekli.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("title", title);
    form.append("competition_id", competitionId);
    form.append("version", version);

    setProgress({ documentId: null, processed: 0, total: 1, phase: "yükleniyor" });
    let data;
    try {
      const res = await fetch("/api/admin/documents", { method: "POST", headers: authHeader, body: form });
      data = await res.json();
      if (!res.ok) {
        setError(data.error || `Yükleme başarısız (HTTP ${res.status}).`);
        setProgress(null);
        return;
      }
    } catch (err) {
      setError("Yükleme sırasında sunucuya ulaşılamadı: " + err.message);
      setProgress(null);
      return;
    }

    const documentId = data.document_id;
    setProgress({ documentId, processed: 0, total: data.total_chunks, phase: "işleniyor" });

    // ÖNEMLİ: burada eskiden sadece `while (!done)` vardı ve batchRes.ok
    // kontrol edilmiyordu. Sunucu hata döndürdüğünde batchData.done
    // undefined (falsy) olduğu için döngü hiç bitmiyor, endpoint'e sonsuz
    // istek atılıyordu. Artık hem hata kontrolü hem de üst tur sınırı var.
    let done = false;
    let guard = 0;
    const maxRounds = Math.ceil(data.total_chunks / 10) + 50;
    while (!done) {
      if (++guard > maxRounds) {
        setError("İşleme beklenenden uzun sürdü ve durduruldu. Lütfen tekrar deneyin.");
        setProgress(null);
        return;
      }
      let batchData;
      try {
        const batchRes = await fetch(`/api/admin/documents/${documentId}/process-batch`, {
          method: "POST",
          headers: authHeader,
        });
        batchData = await batchRes.json();
        if (!batchRes.ok || typeof batchData.done !== "boolean") {
          setError(batchData.error || `İşleme sırasında hata oluştu (HTTP ${batchRes.status}).`);
          setProgress(null);
          return;
        }
      } catch (err) {
        setError("Sunucuya ulaşılamadı: " + err.message);
        setProgress(null);
        return;
      }
      done = batchData.done;
      setProgress({ documentId, processed: batchData.processed, total: batchData.total, phase: done ? "tamamlandı" : "işleniyor" });
    }

    setFile(null);
    setFileInputKey((k) => k + 1);
    setTitle("");
    setVersion("");
    load();
  };

  const toggleStatus = async (doc) => {
    const newStatus = doc.status === "aktif" ? "pasif" : "aktif";
    await fetch(`/api/admin/documents/${doc.id}/toggle-status`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    load();
  };

  const statusTone = { aktif: "green", pasif: "slate", isleniyor: "amber", hata: "red" };

  // Alan etiketi: her girdinin üstünde kalıcı bir başlık.
  const DocField = (label, node) =>
    h(
      "div",
      null,
      h("label", { className: "text-xs font-medium text-slate-600 mb-1 block" }, label),
      node
    );

  return h(
    "div",
    { className: "space-y-4" },
    // --- Yükleme formu -----------------------------------------------------
    h(
      Card,
      { className: "p-5", accent: BRAND.red },
      h(
        "form",
        { className: "space-y-3", onSubmit: upload },
        h(
          "div",
          null,
          h(
            "h3",
            { className: "text-[11px] font-bold uppercase tracking-wider", style: { color: BRAND.navyMid } },
            "Yeni Kaynak Yükle"
          ),
          h(
            "p",
            { className: "text-xs text-slate-500 mt-1" },
            "PDF yükleyin — sistem otomatik olarak parçalara ayırır, anlamsal indekse ekler ve o yarışmanın bilgi tabanına dahil eder."
          )
        ),
        DocField(
          "Yarışma",
          h(
            "select",
            {
              className: "w-full border border-slate-300 rounded px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
              value: competitionId,
              onChange: (e) => setCompetitionId(e.target.value),
            },
            COMPETITIONS.map((c) => h("option", { key: c.id, value: c.id }, c.name))
          )
        ),
        h(
          "div",
          { className: "grid grid-cols-1 sm:grid-cols-3 gap-3" },
          h(
            "div",
            { className: "sm:col-span-2" },
            DocField(
              "Kaynak adı",
              h("input", {
                className: "w-full border border-slate-300 rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
                placeholder: "örn. İHA Şartnamesi 2026",
                value: title,
                onChange: (e) => setTitle(e.target.value),
              })
            )
          ),
          DocField(
            "Versiyon (opsiyonel)",
            h("input", {
              className: "w-full border border-slate-300 rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25 focus:border-[#1a46ec]",
              placeholder: "örn. v2.1",
              value: version,
              onChange: (e) => setVersion(e.target.value),
            })
          )
        ),
        DocField(
          "PDF dosyası",
          h("input", {
            key: fileInputKey,
            type: "file",
            accept: "application/pdf",
            className:
              "w-full text-sm border border-slate-300 rounded px-2.5 py-2 file:mr-3 file:py-1.5 file:px-3 " +
              "file:rounded file:border-0 file:text-[11px] file:font-bold file:uppercase file:tracking-wide " +
              "file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer",
            onChange: (e) => setFile(e.target.files?.[0] || null),
          })
        ),
        error &&
          h(
            "p",
            { className: "text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2.5 py-2 font-medium" },
            error
          ),
        progress &&
          h(
            "div",
            { className: "space-y-1.5" },
            h(
              "div",
              { className: "w-full bg-slate-100 rounded-full h-2 overflow-hidden" },
              h("div", {
                className: "h-2 rounded-full transition-all",
                style: {
                  backgroundColor: progress.phase === "tamamlandı" ? BRAND.green : BRAND.red,
                  width: `${progress.total ? Math.round((progress.processed / progress.total) * 100) : 0}%`,
                },
              })
            ),
            h(
              "p",
              { className: "text-xs text-slate-500 font-medium" },
              `${progress.phase} — ${progress.processed}/${progress.total} parça`
            )
          ),
        h(
          "button",
          {
            type: "submit",
            disabled: !!progress && progress.phase !== "tamamlandı",
            className: CTA_CLASS + " text-[11px] px-5 py-2.5",
            style: { backgroundColor: BRAND.red },
            onMouseEnter: (e) => (e.currentTarget.style.backgroundColor = BRAND.redLight),
            onMouseLeave: (e) => (e.currentTarget.style.backgroundColor = BRAND.red),
          },
          progress && progress.phase !== "tamamlandı" ? "İşleniyor..." : "Yükle ve İşle"
        )
      )
    ),
    // --- Kaynak PDF'i bağlama (jüri notu 7) --------------------------------
    h(
      Card,
      { className: "p-5" },
      h(
        "form",
        { className: "space-y-3", onSubmit: kaynakBagla },
        h(
          "h3",
          { className: "text-[11px] font-bold uppercase tracking-wider", style: { color: BRAND.navyMid } },
          "Kaynak PDF'i Bağla (indirilebilir yapar)"
        ),
        h(
          "p",
          { className: "text-xs text-slate-500" },
          "Cevapların altındaki \"şartname · s.34\" rozetine tıklanınca PDF'in o sayfası açılsın " +
            "istiyorsanız ham dosyayı buradan yükleyin. Bu form belgeyi yeniden parçalamaz, " +
            "sadece mevcut kaynak başlığına dosyayı bağlar."
        ),
        DocField(
          "Kaynak başlığı (cevapta göründüğü gibi birebir)",
          h(
            "div",
            null,
            h("input", {
              className: "w-full border border-slate-300 rounded px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25",
              list: "kaynak-baslik-onerileri",
              value: kBaslik,
              onChange: (e) => setKBaslik(e.target.value),
              placeholder: "İHA Yarışmaları Şartnamesi 2026",
            }),
            h(
              "datalist",
              { id: "kaynak-baslik-onerileri" },
              BILINEN_BASLIKLAR.concat(documents.map((d) => d.title)).map((t, i) =>
                h("option", { key: i, value: t })
              )
            )
          )
        ),
        DocField(
          "PDF dosyası",
          h("input", {
            key: kKey,
            type: "file",
            accept: "application/pdf",
            className:
              "w-full text-sm border border-slate-300 rounded px-2.5 py-2 file:mr-3 file:py-1.5 file:px-3 " +
              "file:rounded file:border-0 file:text-[11px] file:font-bold file:uppercase file:tracking-wide " +
              "file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 file:cursor-pointer",
            onChange: (e) => setKDosya(e.target.files[0] || null),
          })
        ),
        h(
          "button",
          {
            type: "submit",
            className: "text-[12px] font-bold uppercase tracking-wider px-4 py-2 rounded text-white",
            style: { backgroundColor: BRAND.navyMid },
          },
          "Kaynağı Bağla"
        ),
        kDurum &&
          h(
            "p",
            {
              className:
                "text-xs " + (kDurum.startsWith("Hata") ? "text-red-700" : "text-emerald-700"),
            },
            kDurum
          )
      )
    ),

    // --- Kaynak listesi + geçerlilik durumu (AKIŞ 02) ----------------------
    h(
      Card,
      { className: "p-5" },
      h(
        "h3",
        { className: "text-[11px] font-bold uppercase tracking-wider mb-1", style: { color: BRAND.navyMid } },
        "Kaynak Listesi ve Geçerlilik Durumu"
      ),
      h(
        "p",
        { className: "text-xs text-slate-500 mb-4" },
        "Yeni şartname yüklendiğinde eskisini pasife alın; kaynak listesinde pasif olarak " +
          "işaretlenir ve içerik ekibi hangi sürümün yürürlükte olduğunu tek bakışta görür."
      ),
      h(
        "div",
        { className: "space-y-2" },
        documents.map((d) =>
          h(
            "div",
            {
              key: d.id,
              className: "border border-slate-200 rounded p-3 flex items-center gap-3 flex-wrap hover:border-slate-300 transition-colors",
            },
            h(Badge, { tone: statusTone[d.status] || "slate" }, d.status),
            h(
              "div",
              { className: "min-w-0" },
              h("div", { className: "text-sm font-semibold truncate", style: { color: BRAND.navy } }, d.title),
              h(
                "div",
                { className: "text-[11px] text-slate-400 mt-0.5" },
                `${COMPETITIONS.find((c) => c.id === d.competition_id)?.name || d.competition_id}` +
                  (d.version ? ` · v${d.version}` : "") +
                  ` · ${d.chunk_count}/${d.total_chunks} parça · ${fmtDate(d.uploaded_at)}`
              )
            ),
            h("div", { className: "flex-1" }),
            (d.status === "aktif" || d.status === "pasif") &&
              h(
                "button",
                {
                  className: "text-[12px] font-semibold border border-slate-300 px-3 py-1.5 rounded hover:bg-slate-50 transition-colors shrink-0",
                  onClick: () => toggleStatus(d),
                },
                d.status === "aktif" ? "Pasife al" : "Aktif et"
              )
          )
        ),
        documents.length === 0 &&
          h("p", { className: "text-sm text-slate-400 py-4 text-center" }, "Henüz belge yüklenmedi.")
      )
    )
  );
}

// İçerik Yöneticisi'nin kendi tam ekranı (aynı gövde, kendi başlığıyla).
function ContentManagerPanel(props) {
  // İçerik ekibinin asıl ihtiyacı belge yüklemek değil, "hangi konu eksik"
  // sorusunun cevabı. Bu yüzden analiz sekmesi burada da var.
  const [tab, setTab] = useState("belge");
  const TABS = [
    { id: "belge", label: "Belge Yönetimi" },
    { id: "analiz", label: "Yarışma Analizi" },
  ];
  return h(
    PageShell,
    {
      hero: h(PageHero, {
        title: "İçerik Yöneticisi Paneli",
        subtitle: `${props.currentUser.name} — kaynak yönetimi ve soru analizi`,
      }),
    },
    h(
      "div",
      { className: "flex gap-2" },
      TABS.map((t) =>
        h(
          "button",
          {
            key: t.id,
            onClick: () => setTab(t.id),
            className:
              "text-[12px] font-bold uppercase tracking-wider px-4 py-2 rounded border transition-colors " +
              (tab === t.id
                ? "text-white border-transparent"
                : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"),
            style: tab === t.id ? { backgroundColor: BRAND.navyMid } : undefined,
          },
          t.label
        )
      )
    ),
    tab === "belge"
      ? h(DocumentManager, props)
      : h(YarismaAnalizi, { token: props.token, onLogout: props.onLogout })
  );
}

// --- Sistem Yöneticisi dashboard: yanıt kalitesi, insana yönlendirme oranı,
// sık sorulan konular -------------------------------------------------------
// ---------------------------------------------------------------------------
// YARIŞMA ANALİZİ — "bu yarışmada en çok ne merak ediliyor?"
// Talep listesi yalnızca uzmana iletilen soruları gösterir; burada ise sorulan
// HER soru sayılır. Benzer sorular tek satırda toplanır, böylece "ağırlık
// sınırı" 12 farklı cümleyle sorulsa bile tek bir başlık olarak görünür.
// ---------------------------------------------------------------------------
function YarismaAnalizi({ token, onLogout }) {
  const [yarisma, setYarisma] = useState("iha");
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    setYukleniyor(true);
    setHata("");
    fetch(`/api/admin/analiz?competition=${encodeURIComponent(yarisma)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.status === 401 ? (onLogout(), null) : r.ok ? r.json() : null))
      .then((d) => {
        if (!d) setHata("Analiz yüklenemedi.");
        else if (d.hazir === false) setHata(d.not || "Analiz tablosu hazır değil.");
        else setVeri(d);
      })
      .catch((e) => setHata("Sunucuya ulaşılamadı: " + e.message))
      .finally(() => setYukleniyor(false));
  }, [yarisma, token]);

  const ETIKET = {
    cevaplandi: { ad: "Şartnameden cevaplandı", tone: "green" },
    sss: { ad: "SSS havuzundan", tone: "blue" },
    kaynakta_yok: { ad: "Uzmana iletildi", tone: "amber" },
    yanlis_yarisma: { ad: "Yanlış yarışma", tone: "slate" },
    alan_disi: { ad: "Kapsam dışı", tone: "slate" },
  };

  const enCok = (veri && veri.en_cok_merak_edilenler) || [];
  const enBuyuk = enCok.reduce((m, k) => Math.max(m, k.adet), 0) || 1;

  return h(
    "div",
    { className: "space-y-4" },
    h(
      Card,
      { className: "p-5", accent: BRAND.red },
      h(
        "h3",
        { className: "text-[11px] font-bold uppercase tracking-wider", style: { color: BRAND.navyMid } },
        "Yarışma Analizi"
      ),
      h(
        "p",
        { className: "text-xs text-slate-500 mt-1 mb-3" },
        "Bir yarışma seçin: son 90 günde o yarışmada sorulan tüm soruların dağılımını ve " +
          "en çok merak edilen konuları görün. Benzer sorular tek başlıkta toplanır."
      ),
      h(
        "select",
        {
          className:
            "w-full sm:w-auto border border-slate-300 rounded px-2.5 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a46ec]/25",
          value: yarisma,
          onChange: (e) => setYarisma(e.target.value),
        },
        COMPETITIONS.map((c) => h("option", { key: c.id, value: c.id }, c.name))
      )
    ),

    hata &&
      h(
        "div",
        { className: "p-3 rounded bg-amber-50 border border-amber-200 text-sm text-amber-900" },
        hata
      ),

    yukleniyor && !veri && h("p", { className: "text-sm text-slate-400" }, "Yükleniyor..."),

    veri &&
      h(
        Card,
        { className: "p-5" },
        h(
          "div",
          { className: "flex items-baseline gap-2 mb-3" },
          h("span", { className: "text-3xl font-extrabold", style: { color: BRAND.navy } }, veri.toplam_soru),
          h("span", { className: "text-sm text-slate-500" }, "soru soruldu (son " + veri.gun + " gün)")
        ),
        h(
          "div",
          { className: "flex flex-wrap gap-1.5" },
          Object.entries(veri.dagilim || {}).map(([k, v]) =>
            h(Badge, { key: k, tone: (ETIKET[k] && ETIKET[k].tone) || "slate" }, `${(ETIKET[k] && ETIKET[k].ad) || k}: ${v}`)
          )
        ),
        veri.toplam_soru === 0 &&
          h(
            "p",
            { className: "text-sm text-slate-400 mt-3" },
            "Bu yarışmada henüz soru sorulmamış. Sohbet ekranından birkaç soru sorulduğunda bu tablo dolar."
          )
      ),

    veri && enCok.length > 0 &&
      h(
        Card,
        { className: "p-5" },
        h(
          "h3",
          { className: "text-[11px] font-bold uppercase tracking-wider mb-1", style: { color: BRAND.navyMid } },
          "En Çok Merak Edilenler"
        ),
        h(
          "p",
          { className: "text-xs text-slate-500 mb-4" },
          "Bu başlıklar SSS havuzuna alınmaya en uygun adaylar; bir sonraki şartname " +
            "revizyonunda öncelik verilecek konular da bunlar."
        ),
        h(
          "div",
          { className: "space-y-2.5" },
          enCok.map((k, i) =>
            h(
              "div",
              { key: i, className: "border border-slate-200 rounded p-3" },
              h(
                "div",
                { className: "flex items-start gap-3" },
                h(
                  "span",
                  {
                    className:
                      "shrink-0 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center text-white",
                    style: { backgroundColor: BRAND.navyMid },
                  },
                  i + 1
                ),
                h(
                  "div",
                  { className: "min-w-0 flex-1" },
                  h("div", { className: "text-sm font-semibold", style: { color: BRAND.navy } }, k.soru),
                  h(
                    "div",
                    { className: "h-1.5 rounded bg-slate-100 mt-2 overflow-hidden" },
                    h("div", {
                      // Yükseklik/genişlik satır içi veriliyor: sınıf adına
                      // bağlı kalmadan her ortamda aynı görünsün.
                      style: {
                        width: `${Math.max(6, Math.round((k.adet / enBuyuk) * 100))}%`,
                        height: "100%",
                        borderRadius: "9999px",
                        backgroundColor: BRAND.red,
                      },
                    })
                  ),
                  h(
                    "div",
                    { className: "text-[11px] text-slate-500 mt-1.5" },
                    `${k.adet} kez soruldu` + (k.cevapsiz ? ` · ${k.cevapsiz} kez şartnamede karşılığı bulunamadı` : "")
                  )
                )
              )
            )
          )
        )
      ),

    veri && (veri.kaynakta_olmayan_tekrarlayanlar || []).length > 0 &&
      h(
        Card,
        { className: "p-5", accent: BRAND.red },
        h(
          "h3",
          { className: "text-[11px] font-bold uppercase tracking-wider mb-1", style: { color: BRAND.navyMid } },
          "Şartnamede Karşılığı Olmayan Tekrarlayan Sorular"
        ),
        h(
          "p",
          { className: "text-xs text-slate-500 mb-3" },
          "Aynı konu defalarca soruluyor ama belgelerde hüküm yok. Bu liste, şartnamenin " +
            "gerçekten eksik olduğu yerleri gösterir."
        ),
        h(
          "ul",
          { className: "space-y-1.5" },
          veri.kaynakta_olmayan_tekrarlayanlar.map((k, i) =>
            h(
              "li",
              { key: i, className: "text-sm flex gap-2" },
              h(Badge, { tone: "amber" }, `${k.cevapsiz}×`),
              h("span", { className: "text-slate-700" }, k.soru)
            )
          )
        )
      )
  );
}

function AdminStats({ currentUser, token, onLogout }) {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");

  useEffect(() => {
    // Eskiden sadece 401 ele alınıyordu; bir 500 yanıtı ({error: "..."})
    // truthy olduğu için stats'e yazılıyor, sonra stats.top_questions.length
    // patlayıp tüm ekranı beyaza düşürüyordu.
    // Hata durumunda sadece "yüklenemedi" demek teşhisi imkânsız kılıyordu;
    // artık HTTP kodunu ve sunucunun döndürdüğü mesajı da gösteriyoruz.
    fetch("/api/admin/stats", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (r.status === 401) {
          onLogout();
          return null;
        }
        const metin = await r.text();
        let veri = null;
        try {
          veri = JSON.parse(metin);
        } catch (_) {
          /* JSON değilse ham metni gösteririz */
        }
        if (!r.ok) {
          setStatsError(
            `İstatistikler yüklenemedi (HTTP ${r.status}). ` +
              ((veri && veri.error) || metin.slice(0, 200) || "Sunucu ayrıntı vermedi.")
          );
          return null;
        }
        return veri;
      })
      .then((d) => {
        if (d && !d.error) setStats(d);
        else if (d) setStatsError(d.error);
      })
      .catch((err) => setStatsError("Sunucuya ulaşılamadı: " + err.message));
  }, [token]);

  if (!stats) {
    return statsError
      ? h(
          "div",
          { className: "p-3 rounded bg-red-50 border border-red-200 text-sm text-red-800 font-medium" },
          statsError
        )
      : h("p", { className: "text-sm text-slate-400" }, "Yükleniyor...");
  }

  const helpfulTotal = stats.helpful_yes + stats.helpful_no;
  const helpfulPct = helpfulTotal ? Math.round((stats.helpful_yes / helpfulTotal) * 100) : null;

  const Tile = (label, value, tone) =>
    h(
      "div",
      {
        className: "bg-white rounded-lg border border-slate-200 p-4 text-center shadow-[0_1px_3px_rgba(0,27,72,0.06)]",
        style: { borderTopWidth: 3, borderTopColor: tone || BRAND.navyMid },
      },
      h("div", { className: "text-2xl font-extrabold", style: { color: tone || BRAND.navyMid } }, value),
      h("div", { className: "text-[11px] uppercase tracking-wider text-slate-500 mt-1" }, label)
    );

  return h(
    "div",
    { className: "space-y-4" },
    // Kısmi hata: bazı sayılar gelmediyse sessizce sıfır göstermek yerine söyle.
    (stats.uyarilar || []).length > 0 &&
      h(
        "div",
        { className: "p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1" },
        h("p", { className: "font-semibold" }, "Bazı istatistikler okunamadı:"),
        stats.uyarilar.map((u, i) => h("p", { key: i }, "• " + u))
      ),
    h(
      "div",
      { className: "grid grid-cols-2 sm:grid-cols-4 gap-3" },
      Tile("Toplam soru", stats.total),
      Tile("İnsana yönlendirme", `%${stats.human_routed_pct}`, BRAND.red),
      Tile("Faydalı bulundu (👍)", helpfulPct !== null ? `%${helpfulPct}` : "—", BRAND.green),
      Tile("👎 geri bildirim", stats.helpful_no, BRAND.red)
    ),
    h(
      "div",
      { className: "bg-white rounded-lg border border-slate-200 shadow-[0_1px_3px_rgba(0,27,72,0.06)] p-4" },
      h("p", { className: "text-sm font-semibold text-slate-700 mb-2" }, "En çok sorulan konular"),
      (stats.top_questions || []).length === 0 && h("p", { className: "text-sm text-slate-400" }, "Henüz veri yok."),
      h(
        "div",
        { className: "space-y-1" },
        (stats.top_questions || []).map((q, i) =>
          h(
            "div",
            { key: i, className: "flex justify-between text-sm border-b border-slate-100 py-1" },
            h(
              "span",
              { className: "text-slate-700 truncate pr-3", title: q.q },
              q.q.length > 90 ? q.q.slice(0, 90) + "…" : q.q
            ),
            h(Badge, { tone: "navy" }, `${q.cnt}x`)
          )
        )
      )
    ),
    h(
      "div",
      { className: "bg-white rounded-lg border border-slate-200 shadow-[0_1px_3px_rgba(0,27,72,0.06)] p-4" },
      h("p", { className: "text-sm font-semibold text-slate-700 mb-2" }, "Yarışma bazlı dağılım"),
      (stats.by_category || []).length === 0 && h("p", { className: "text-sm text-slate-400" }, "Henüz veri yok."),
      h(
        "div",
        { className: "space-y-1" },
        (stats.by_category || []).map((c, i) =>
          h(
            "div",
            { key: i, className: "flex justify-between text-sm border-b border-slate-100 py-1" },
            h("span", { className: "text-slate-700" }, COMPETITIONS.find((x) => x.id === c.category)?.name || c.category || "—"),
            h(Badge, { tone: "navy" }, `${c.cnt}`)
          )
        )
      )
    )
  );
}

// --- Sistem Yöneticisi ekranı: sekmeli. Sistem yöneticisi hem yanıt kalitesini
// izleyebilir hem de yeni yarışma belgelerini kendisi yükleyebilir (belge
// uçları sunucuda zaten "admin" rolüne de açık). İçerik Yöneticisi'nin kendi
// ayrı ekranı korunuyor — roller ayrı, yetkiler kesişiyor.
function AdminDashboard({ currentUser, token, onLogout }) {
  const [tab, setTab] = useState("stats");

  const TABS = [
    { id: "stats", label: "İstatistikler" },
    { id: "analiz", label: "Yarışma Analizi" },
    { id: "docs", label: "Belge Yönetimi" },
  ];

  return h(
    PageShell,
    {
      hero: h(PageHero, {
        title: "Sistem Yöneticisi Paneli",
        subtitle: `${currentUser.name} — yanıt kalitesi izleme ve kaynak yönetimi`,
      }),
    },
    h(
      "div",
      { className: "flex gap-2" },
      TABS.map((t) =>
        h(
          "button",
          {
            key: t.id,
            onClick: () => setTab(t.id),
            className:
              "text-[12px] font-bold uppercase tracking-wider px-4 py-2 rounded border transition-colors " +
              (tab === t.id
                ? "text-white border-transparent"
                : "bg-white text-slate-600 border-slate-300 hover:border-slate-400"),
            style: tab === t.id ? { backgroundColor: BRAND.navyMid } : undefined,
          },
          t.label
        )
      )
    ),
    tab === "stats"
      ? h(AdminStats, { currentUser, token, onLogout })
      : tab === "analiz"
        ? h(YarismaAnalizi, { token, onLogout })
        : h(DocumentManager, { currentUser, token, onLogout })
  );
}

function loadStoredSession() {
  try {
    const raw = localStorage.getItem("iha_sss_staff_session");
    const s = raw ? JSON.parse(raw) : null;
    // Sadece parse hatasına bakmak yetmiyordu: eski/bozuk bir formatta
    // ({} veya {user:null}) kayıt varsa user.role okunurken render patlıyor,
    // kayıt kalıcı olduğu için her açılışta tekrar patlıyordu.
    if (!(s && s.user && s.user.role && s.token)) return null;
    // Token 24 saatte doluyor. Süresi geçmiş kaydı yüklersek uygulama panele
    // açılıyor, ilk istek 401 dönüyor ve kullanıcı sessizce dışarı atılıyordu.
    try {
      const body = JSON.parse(atob(s.token.split(".")[1]));
      if (body && body.exp && body.exp * 1000 < Date.now()) return null;
    } catch {
      /* token çözülemiyorsa oturumu yine de deneriz; sunucu reddeder */
    }
    return s;
  } catch {
    return null;
  }
}

function App() {
  const users = useUsers();
  const [competition, setCompetition] = useState(null);
  const [session, setSession] = useState(loadStoredSession); // { user, token }
  const [tracking, setTracking] = useState(false);
  // Giriş yapmış bir ekip üyesi de yarışmacı ekranını görebilsin: logoya
  // basınca oturum kapanmadan yarışmacı görünümüne geçiyoruz.
  const [visitorMode, setVisitorMode] = useState(false);
  const yarisciUser = users.find((u) => u.role === "yarisci") || null;
  // Giriş yapan yarışmacı bir "ekip üyesi" değil: panele değil, normal ana
  // sayfaya gider. Sadece "Talebimi Sorgula" bağlantısı "Sorularım" olur.
  const girenYarisci = session && session.user && session.user.role === "yarisci" ? session.user : null;
  const ekipOturumu = session && !girenYarisci;

  const login = (user, token) => {
    const s = { user, token };
    setSession(s);
    setVisitorMode(false);
    try {
      localStorage.setItem("iha_sss_staff_session", JSON.stringify(s));
    } catch {}
  };

  const logout = () => {
    setSession(null);
    setVisitorMode(false);
    try {
      localStorage.removeItem("iha_sss_staff_session");
    } catch {}
  };

  const goHome = () => {
    setCompetition(null);
    setTracking(false);
    if (session && session.user && session.user.role !== "yarisci") setVisitorMode(true);
  };

  // Farklı staff rolleri farklı, ayrı ekranlara yönlendirilir (paylaşılan tek
  // panel yerine): hakem/koordinator -> StaffPanel, icerik_yoneticisi ->
  // ContentManagerPanel, admin -> AdminDashboard.
  const renderStaffScreen = () => {
    const { user, token } = session;
    if (user.role === "icerik_yoneticisi") {
      return h(ContentManagerPanel, { currentUser: user, token, onLogout: logout });
    }
    if (user.role === "admin") {
      return h(AdminDashboard, { currentUser: user, token, onLogout: logout });
    }
    return h(StaffPanel, { currentUser: user, token, onLogout: logout });
  };

  return h(
    "div",
    { className: "min-h-screen" },
    h(TopBar, {
      onLogoClick: goHome,
      onTrackClick: () => setTracking(true),
      panelSlot:
        ekipOturumu && visitorMode
          ? h(
              "button",
              {
                className:
                  "text-[11px] font-bold uppercase tracking-wider text-white/85 border border-white/25 " +
                  "rounded px-3 py-1.5 hover:bg-white/10 transition-colors",
                onClick: () => {
                  setVisitorMode(false);
                  setTracking(false);
                  setCompetition(null);
                },
              },
              "Panele dön"
            )
          : null,
      trackLabel: girenYarisci ? "Sorularım" : "Talebimi Sorgula",
      trackLabelShort: girenYarisci ? "Sorularım" : "Talebim",
      staffLoginSlot: h(StaffLoginBar, {
        currentUser: session?.user || null,
        onLogin: login,
        onLogout: logout,
      }),
    }),
    // Not: `tracking` artık `session`'dan ÖNCE kontrol ediliyor. Aksi hâlde
    // giriş yapmış bir ekip üyesi "Talebimi Sorgula"ya bastığında hiçbir şey
    // olmuyordu (state değişiyor ama o dal hiç render edilmiyordu).
    tracking
      ? girenYarisci
        ? h(SorularimScreen, { token: session.token, onBack: () => setTracking(false) })
        : h(TrackScreen, { onBack: () => setTracking(false) })
      : ekipOturumu && !visitorMode
      ? renderStaffScreen()
      : !competition
      ? h(CompetitionPicker, { onSelect: setCompetition })
      : h(
          "div",
          { className: "min-h-screen bg-[#eef2f7]" },
          // Sohbet ekranının üst bandı: yarışma ikonu + adı, uzay zemininde
          h(
            "div",
            { className: "relative overflow-hidden px-4 sm:px-8 py-9", style: { background: SPACE_BG } },
            h("div", { className: "absolute inset-0 opacity-50", style: STAR_LAYER }),
            h("div", {
              className: "absolute -top-20 right-10 w-64 h-64 rounded-full blur-3xl opacity-25 pointer-events-none",
              style: { background: BRAND.blueGlow },
            }),
            h("div", {
              className: "absolute bottom-0 left-0 right-0 h-1",
              style: { background: `linear-gradient(90deg, ${BRAND.red}, ${BRAND.blue}, ${BRAND.yellow})` },
            }),
            h(
              "div",
              { className: "relative max-w-6xl mx-auto" },
              h(
                "button",
                {
                  className: "text-[11px] font-semibold uppercase tracking-wider text-white/60 hover:text-white transition-colors",
                  onClick: () => setCompetition(null),
                },
                "← Yarışma seçimine dön"
              ),
              h(
                "div",
                { className: "flex items-center gap-3.5 mt-3" },
                h(
                  "div",
                  {
                    className: "w-11 h-11 rounded-lg flex items-center justify-center text-white shrink-0",
                    style: { background: `linear-gradient(135deg, ${BRAND.red}, ${BRAND.redDark})` },
                  },
                  h(Icon, { name: iconFor(competition.name), size: 22 })
                ),
                h(
                  "div",
                  null,
                  h(
                    "h1",
                    { className: "text-lg sm:text-2xl font-extrabold text-white tracking-tight leading-tight" },
                    competition.name
                  ),
                  h(
                    "p",
                    { className: "text-[11px] uppercase tracking-widest text-white/45 mt-0.5" },
                    "Şartname & kılavuz asistanı"
                  )
                )
              )
            )
          ),
          h(
            "div",
            { className: "max-w-6xl mx-auto p-4 sm:p-8 space-y-4" },
            h(ChatPanel, { competition, currentUser: girenYarisci || yarisciUser })
          )
        )
  );
}

createRoot(document.getElementById("root")).render(h(App));

// Açılış perdesini kaldır (React bağlandı).
const boot = document.getElementById("boot");
if (boot) {
  boot.style.opacity = "0";
  setTimeout(() => boot.remove(), 350);
}

// ---------------------------------------------------------------------------
// Tarayıcı önbelleği yüzünden eski arayüzün açılıp açılmadığını gözle görmek
// için küçük bir sürüm rozeti. index.html'deki /app.js?v=... ile aynı olmalı.
// ---------------------------------------------------------------------------
const ARAYUZ_SURUM = "20260906e";
console.log("[Arayüz sürümü]", ARAYUZ_SURUM);
try {
  const rozet = document.createElement("div");
  rozet.textContent = "arayüz " + ARAYUZ_SURUM;
  rozet.style.cssText =
    "position:fixed;left:6px;bottom:6px;z-index:9999;font:10px/1.4 ui-monospace,monospace;" +
    "color:#94a3b8;background:rgba(15,23,42,.65);padding:2px 6px;border-radius:6px;pointer-events:none";
  document.body.appendChild(rozet);
} catch (_) {}
