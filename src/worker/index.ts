import { Hono } from "hono";
import type { Env, DocumentRow } from "./types";
import { answerFromKnowledgeBase, ilgiliKaynaklar, aramaSorusu, takipSorusuMu } from "./rag";
import type { GecmisOge } from "./rag";
import { verifyPassword, hashPassword, signToken, requireAuth } from "./auth";
import { chunkPages } from "./chunker";
import { extractText, getDocumentProxy } from "unpdf";

const app = new Hono<{ Bindings: Env }>();

// Beklenmeyen bir hata olduğunda Workers varsayılan olarak HTML bir hata
// sayfası döndürüyordu; frontend bunu JSON olarak okuyamayınca kullanıcıya
// sadece "Sunucuya ulaşılamadı" gibi anlamsız bir mesaj gösteriliyordu.
// Artık her hata JSON olarak, gerçek sebebiyle birlikte dönüyor.
app.onError((err, c) => {
  console.error("Worker hatası:", err);
  return c.json({ error: `Sunucu hatası: ${err.message}` }, 500);
});

const STAFF_ROLES = ["hakem", "koordinator", "admin", "icerik_yoneticisi"] as const;
const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const BATCH_SIZE = 15; // Workers CPU süresi içinde kalmak için embed+insert batch boyutu

// ---------------------------------------------------------------------------
// Kimlik doğrulama: id (email) + şifre ile staff girişi. Başarılı girişte
// imzalı bir token döner (24 saat geçerli), frontend bunu Authorization:
// Bearer header'ında saklar.
// ---------------------------------------------------------------------------
// Kurulum teşhis ucu: hangi tabloların/kolonların hazır olduğunu ve
// AUTH_SECRET'in tanımlı olup olmadığını söyler. Deploy sonrası
// /api/health adresini açmak, eksik migration'ı saniyeler içinde gösterir.
app.get("/api/health", async (c) => {
  const checks: Record<string, unknown> = {
    build: "2026-09-05-yetki-v2",
    auth_secret: c.env.AUTH_SECRET ? "tanımlı" : "EKSİK — wrangler secret put AUTH_SECRET",
  };

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT email, role, competitions FROM users ORDER BY id`
    ).all();
    checks["yetkiler"] = (results as any[]).map((r) => ({
      email: r.email,
      role: r.role,
      kolon: r.competitions ?? null,
      cozulen: yetkiCoz(String(r.email ?? ""), r.competitions ?? null),
    }));
  } catch (err) {
    checks["yetkiler"] = `okunamadı — ${err instanceof Error ? err.message : String(err)}`;
  }

  const tables = ["users", "tickets", "ticket_events", "faqs", "documents", "document_chunks"];
  for (const t of tables) {
    try {
      const row = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>();
      checks[t] = `var (${row?.n ?? 0} kayıt)`;
    } catch (err) {
      checks[t] = `YOK — ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  try {
    const row = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE password_hash IS NOT NULL`
    ).first<{ n: number }>();
    checks.sifre_tanimli_kullanici = `${row?.n ?? 0} kullanıcı`;
  } catch (err) {
    checks.sifre_tanimli_kullanici = `KOLON YOK — migration_v5 çalıştırılmalı (${
      err instanceof Error ? err.message : String(err)
    })`;
  }

  return c.json(checks);
});

// ---------------------------------------------------------------------------
// Tek seferlik kurulum ucu: veritabanı şemasını kendisi tamamlar.
//
// `wrangler d1 execute` ile migration çalıştırmak kırılgan olduğu için (yanlış
// klasör, atlanan dosya, SQLite'ın FK kısıtları) aynı işi Worker'ın kendisi
// yapıyor. Tarayıcıdan şu adres açılır:
//   /api/setup?key=t3-creathon-2026
//
// Tamamen idempotent: zaten uygulanmış adımlar atlanır, veri kaybolmaz.
// Ticket'ların kullanıcı bağlantıları yedeklenip geri yüklenir.
// ---------------------------------------------------------------------------
// Kurulum anahtarı ARTIK KODDA DEĞİL. Kaynak kodu herkese açık olduğu için
// sabit bir anahtar, veritabanını sıfırlayabilen bir uç noktayı da herkese
// açık hâle getiriyordu. Anahtar bir Cloudflare secret'ından okunuyor:
//   npx wrangler secret put SETUP_KEY
// Secret tanımlı değilse /api/setup tamamen kapalıdır.

const DEMO_ACCOUNTS: { email: string; name: string; role: string; salt: string; password: string }[] = [
  { email: "hakem@demo.t3", name: "Demo Hakem", role: "hakem", salt: "salt-hakem", password: "hakem123" },
  { email: "koordinator@demo.t3", name: "Demo Koordinatör", role: "koordinator", salt: "salt-koordinator", password: "koordinator123" },
  { email: "admin@demo.t3", name: "Demo Admin", role: "admin", salt: "salt-admin", password: "admin123" },
  { email: "icerik@demo.t3", name: "Demo İçerik Yöneticisi", role: "icerik_yoneticisi", salt: "salt-icerik", password: "icerik123" },
  // Yarışma bazlı hakemler: her biri yalnızca kendi yarışmasının taleplerini görür.
  { email: "iha.hakem@demo.t3", name: "İHA Hakemi", role: "hakem", salt: "salt-iha", password: "iha123" },
  { email: "blok.hakem@demo.t3", name: "Blokzincir Hakemi", role: "hakem", salt: "salt-blok", password: "blok123" },
  // Yarışmacı girişi: kendi sorularını "Sorularım" ekranında görebilsin diye.
  { email: "yarisci@demo.t3", name: "Demo Yarışmacı", role: "yarisci", salt: "salt-yarisci", password: "yarisci123" },
];

app.get("/api/setup", async (c) => {
  const anahtar = (c.env as unknown as { SETUP_KEY?: string }).SETUP_KEY;
  if (!anahtar) {
    return c.json(
      { error: "Kurulum uç noktası kapalı. Açmak için: npx wrangler secret put SETUP_KEY" },
      403
    );
  }
  if (c.req.query("key") !== anahtar) {
    return c.json({ error: "Kurulum anahtarı hatalı." }, 403);
  }

  const log: string[] = [];
  const run = async (sql: string, tolerant = false) => {
    try {
      await c.env.DB.prepare(sql).run();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!tolerant) throw new Error(`${sql.slice(0, 60)}... -> ${msg}`);
      return false;
    }
  };

  // 1) Şifre kolonları (zaten varsa sessizce atlanır)
  const addedHash = await run("ALTER TABLE users ADD COLUMN password_hash TEXT", true);
  const addedSalt = await run("ALTER TABLE users ADD COLUMN password_salt TEXT", true);
  log.push(addedHash || addedSalt ? "Şifre kolonları eklendi." : "Şifre kolonları zaten vardı.");

  // 2) 'icerik_yoneticisi' rolü users tablosundaki CHECK kısıtına takılıyor mu?
  //    Takılıyorsa tabloyu genişletilmiş CHECK ile yeniden inşa ediyoruz.
  let needsRebuild = false;
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (name, email, role) VALUES (?, ?, 'icerik_yoneticisi')
       ON CONFLICT(email) DO NOTHING`
    )
      .bind("Demo İçerik Yöneticisi", "icerik@demo.t3")
      .run();
    log.push("İçerik Yöneticisi rolü zaten destekleniyordu.");
  } catch {
    needsRebuild = true;
  }

  if (needsRebuild) {
    // SQLite'ta CHECK kısıtı ALTER edilemez; tabloyu yeniden kurmak gerekiyor.
    // DROP TABLE users, tickets/ticket_events'teki FK referansları yüzünden
    // patlıyor. defer_foreign_keys D1'de (autocommit) işe yaramadığı için
    // referansları geçici bir tabloya yedekleyip NULL'lıyor, tablo değişimi
    // bittikten sonra aynı id'lerle geri yazıyoruz — veri kaybı olmuyor.
    await run(`CREATE TABLE IF NOT EXISTS _fk_backup (tbl TEXT, row_id INTEGER, col TEXT, val INTEGER)`);
    await run(`DELETE FROM _fk_backup`);
    await run(`INSERT INTO _fk_backup SELECT 'tickets', id, 'user_id', user_id FROM tickets WHERE user_id IS NOT NULL`);
    await run(`INSERT INTO _fk_backup SELECT 'tickets', id, 'assigned_to', assigned_to FROM tickets WHERE assigned_to IS NOT NULL`);
    await run(`INSERT INTO _fk_backup SELECT 'ticket_events', id, 'actor_id', actor_id FROM ticket_events WHERE actor_id IS NOT NULL`, true);
    await run(`UPDATE tickets SET user_id = NULL`);
    await run(`UPDATE tickets SET assigned_to = NULL`);
    await run(`UPDATE ticket_events SET actor_id = NULL`, true);

    await run(`DROP TABLE IF EXISTS users_new`);
    await run(`CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('yarisci','hakem','koordinator','admin','icerik_yoneticisi')),
      team_name TEXT,
      password_hash TEXT,
      password_salt TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    await run(`INSERT INTO users_new (id,name,email,role,team_name,password_hash,password_salt,created_at)
               SELECT id,name,email,role,team_name,password_hash,password_salt,created_at FROM users`);
    await run(`DROP TABLE users`);
    await run(`ALTER TABLE users_new RENAME TO users`);

    await run(`UPDATE tickets SET user_id = (SELECT val FROM _fk_backup b WHERE b.tbl='tickets' AND b.col='user_id' AND b.row_id=tickets.id)
               WHERE id IN (SELECT row_id FROM _fk_backup WHERE tbl='tickets' AND col='user_id')`);
    await run(`UPDATE tickets SET assigned_to = (SELECT val FROM _fk_backup b WHERE b.tbl='tickets' AND b.col='assigned_to' AND b.row_id=tickets.id)
               WHERE id IN (SELECT row_id FROM _fk_backup WHERE tbl='tickets' AND col='assigned_to')`);
    await run(`UPDATE ticket_events SET actor_id = (SELECT val FROM _fk_backup b WHERE b.tbl='ticket_events' AND b.col='actor_id' AND b.row_id=ticket_events.id)
               WHERE id IN (SELECT row_id FROM _fk_backup WHERE tbl='ticket_events' AND col='actor_id')`, true);
    await run(`DROP TABLE _fk_backup`, true);
    log.push("users tablosu İçerik Yöneticisi rolünü kabul edecek şekilde yeniden kuruldu (ticket bağlantıları korundu).");

    await c.env.DB.prepare(
      `INSERT INTO users (name, email, role) VALUES (?, ?, 'icerik_yoneticisi')
       ON CONFLICT(email) DO NOTHING`
    )
      .bind("Demo İçerik Yöneticisi", "icerik@demo.t3")
      .run();
  }

  // 3) Demo hesaplarının şifreleri (hash çalışma anında üretilir)
  for (const acc of DEMO_ACCOUNTS) {
    const hash = await hashPassword(acc.password, acc.salt);
    await c.env.DB.prepare(
      `INSERT INTO users (name, email, role, password_hash, password_salt)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt`
    )
      .bind(acc.name, acc.email, acc.role, hash, acc.salt)
      .run();
  }
  log.push(`${DEMO_ACCOUNTS.length} ekip hesabının şifresi ayarlandı.`);

  // 4) Belge yönetimi tabloları
  await run(`CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    version TEXT,
    status TEXT NOT NULL DEFAULT 'isleniyor' CHECK (status IN ('isleniyor','aktif','pasif','hata')),
    chunk_count INTEGER NOT NULL DEFAULT 0,
    total_chunks INTEGER NOT NULL DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
    r2_key TEXT)`);
  await run(`CREATE TABLE IF NOT EXISTS document_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id INTEGER NOT NULL REFERENCES documents(id),
    vector_id TEXT NOT NULL,
    page INTEGER,
    madde_no TEXT,
    madde_title TEXT,
    text TEXT NOT NULL,
    embedded INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  await run(`CREATE TABLE IF NOT EXISTS faqs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_ticket_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  log.push("Belge yönetimi ve SSS tabloları hazır.");

  const users = await c.env.DB.prepare(
    `SELECT email, role FROM users WHERE password_hash IS NOT NULL ORDER BY id`
  ).all<{ email: string; role: string }>();

  return c.json({
    sonuc: "KURULUM TAMAMLANDI",
    adimlar: log,
    giris_yapabilecek_hesaplar: users.results ?? [],
    not: "Artık /api/health adresinden durumu kontrol edip giriş yapabilirsiniz.",
  });
});

// ---------------------------------------------------------------------------
// Hangi kodun canlıda olduğunu GET ile doğrulayabilmek için sürüm damgası.
// Her yayından sonra /api/health çıktısında bu değerin değiştiğini görmeliyiz.
// ---------------------------------------------------------------------------
export const BUILD_SURUM = "2026-09-05-yetki-v2";

// Personelin sorumlu olduğu yarışmalar normalde users.competitions kolonundan
// gelir. Kolon boşsa (migration uzak veritabanında çalışmadıysa) eskiden HİÇBİR
// kısıt uygulanmıyordu, yani sistem "açık" tarafa düşüyordu. Demo hesapları için
// aşağıdaki harita bu boşluğu kapatır: veritabanı ne derse desin hakem yalnızca
// kendi yarışmasını görür.
const VARSAYILAN_YETKI: Record<string, string[]> = {
  "hakem@demo.t3": ["iha"],
  "koordinator@demo.t3": ["blokzincir", "cip_tasarim"],
  "iha.hakem@demo.t3": ["iha"],
  "blok.hakem@demo.t3": ["blokzincir"],
};

function yetkiCoz(email: string, kolon?: string | null): string[] {
  const dbden = (kolon ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (dbden.length) return dbden;
  return VARSAYILAN_YETKI[(email || "").trim().toLowerCase()] ?? [];
}

app.post("/api/auth/login", async (c) => {
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password) return c.json({ error: "E-posta ve şifre gerekli." }, 400);

  if (!c.env.AUTH_SECRET) {
    // Bu secret eksikse token imzalanamaz. Eskiden bu durum ham bir 500'e
    // dönüşüyordu; artık ne yapılması gerektiğini açıkça söylüyoruz.
    return c.json(
      { error: "Sunucu yapılandırması eksik: AUTH_SECRET tanımlı değil (wrangler secret put AUTH_SECRET)." },
      500
    );
  }

  let user;
  try {
    user = (await c.env.DB.prepare(
      `SELECT id, name, role, password_hash, password_salt, competitions FROM users WHERE email = ?`
    )
      .bind(email)
      .first()) as {
      id: number; name: string; role: string;
      password_hash: string | null; password_salt: string | null;
      competitions?: string | null;
    } | null;
  } catch (err) {
    // En sık sebep: migration_v5 uzak veritabanında çalıştırılmamış, yani
    // users tablosunda password_hash/password_salt kolonları yok.
    const msg = err instanceof Error ? err.message : String(err);
    return c.json(
      {
        error:
          "Kullanıcı tablosu okunamadı (" + msg + "). " +
          "Muhtemelen veritabanı migration'ları eksik: npm run db:migrate-v4:remote ve npm run db:migrate-v5:remote çalıştırın.",
      },
      500
    );
  }

  if (!user || !user.password_hash || !user.password_salt) {
    return c.json({ error: "Kullanıcı bulunamadı veya şifre tanımlı değil." }, 401);
  }

  const ok = await verifyPassword(password, user.password_salt, user.password_hash);
  if (!ok) return c.json({ error: "E-posta veya şifre hatalı." }, 401);

  const comps = yetkiCoz(email, user.competitions);

  const token = await signToken(
    {
      uid: user.id,
      role: user.role as never,
      name: user.name,
      email,
      comps,
      exp: Math.floor(Date.now() / 1000) + 24 * 3600,
    },
    c.env.AUTH_SECRET
  );

  return c.json({
    token,
    user: { id: user.id, name: user.name, role: user.role, competitions: comps },
  });
});

// ---------------------------------------------------------------------------
// MVP madde 1+2+3: RAG chatbot - şartnameye dayalı cevap, kaynak gösterme,
// emin olamayınca insana yönlendirme (otomatik ticket açma). Yarışma bazlı
// filtreleme (madde 6): competition seçilmişse Vectorize sorgusu ona göre kısıtlanır.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Hakem yetkilendirmesi: bir hakem yalnızca kendisine atanan yarışmaların
// taleplerini görebilir ve cevaplayabilir. competitions NULL/boş ise (koordinatör,
// admin) kısıt yoktur.
// ---------------------------------------------------------------------------
async function yetkiliYarismalar(c: any, uid: number): Promise<string[] | null> {
  // 1) Token'daki değer — giriş anında yazıldığı için en güvenilir kaynak.
  try {
    const p = c.get("authUser" as never) as { comps?: string[]; email?: string } | undefined;
    if (p && Array.isArray(p.comps)) {
      if (p.comps.length) return p.comps;
      const v = yetkiCoz(String(p.email ?? ""), null);
      if (v.length) return v;
      return null;
    }
  } catch {
    /* yoksa veritabanına düş */
  }
  // 2) Eski token'lar comps taşımıyor: veritabanından oku.
  try {
    const row = (await c.env.DB.prepare(`SELECT email, competitions FROM users WHERE id = ?`)
      .bind(uid)
      .first()) as { email: string | null; competitions: string | null } | null;
    const cozum = yetkiCoz(String(row?.email ?? ""), row?.competitions ?? null);
    return cozum.length ? cozum : null;
  } catch {
    // Kolon yoksa bile e-postaya göre varsayılan yetkiyi uygulamayı deneriz;
    // sessizce "herkes her şeyi görsün"e düşmek bir güvenlik hatasıydı.
    try {
      const r2 = (await c.env.DB.prepare(`SELECT email FROM users WHERE id = ?`)
        .bind(uid)
        .first()) as { email: string | null } | null;
      const cozum = yetkiCoz(String(r2?.email ?? ""), null);
      return cozum.length ? cozum : null;
    } catch {
      return null;
    }
  }
}

// Sözcüksel benzerlik. Türkçe sondan eklemeli bir dil olduğu için düz kelime
// karşılaştırması işe yaramıyordu: "ağırlık sınırları neler" ile "ağırlık sınırı
// nedir" hiçbir kelimesi birebir tutmadığı için 0 puan alıyor, SSS eşleşmesi hiç
// çalışmıyordu. Bu yüzden üç şey yapıyoruz:
//   1) soru kelimelerini (nedir, nasıl, kaç ...) atıyoruz — hepsinde ortak,
//   2) kelimeleri ilk 5 harfe kırpıyoruz (kaba gövdeleme): ağırlık ~ ağırlığı,
//   3) buna ek olarak karakter üçlüsü (trigram) benzerliği hesaplayıp
//      ikisinin büyüğünü alıyoruz — ekler tamamen kaydırdığında bu yakalıyor.
const DURAK_KELIMELER = new Set(
  ("nedir neler nasıl nasil kaç kac hangi olur oluyor mıdır midir mi mı mu mü var yok " +
   "için icin ile ve veya bir bu şu ne olmalı olacak gerekiyor edilir sayılır zorunlu")
    .split(" ")
);

function normalize(t: string): string[] {
  return (t || "")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** Anlam taşıyan kelimelerin kaba gövdeleri. */
function govdeler(t: string): string[] {
  return normalize(t)
    .filter((w) => !DURAK_KELIMELER.has(w))
    .map((w) => w.slice(0, 5));
}

function diceSet(A: Set<string>, B: Set<string>): number {
  if (A.size === 0 || B.size === 0) return 0;
  let ortak = 0;
  for (const w of A) if (B.has(w)) ortak++;
  return (2 * ortak) / (A.size + B.size);
}

function trigramlar(t: string): Set<string> {
  const d = " " + normalize(t).join(" ") + " ";
  const S = new Set<string>();
  for (let i = 0; i < d.length - 2; i++) S.add(d.slice(i, i + 3));
  return S;
}

/** Ortak gövde sayısı — tek başına yüksek trigram puanına güvenmemek için. */
function ortakGovdeSayisi(a: string, b: string): number {
  const B = new Set(govdeler(b));
  return [...new Set(govdeler(a))].filter((w) => B.has(w)).length;
}

function benzerlik(a: string, b: string): number {
  const kelime = diceSet(new Set(govdeler(a)), new Set(govdeler(b)));
  const trigram = diceSet(trigramlar(a), trigramlar(b));
  return Math.max(kelime, trigram);
}

const SSS_ESIGI = 0.62;

// Sorulan her soruyu (cevaplansın ya da cevaplanmasın) analiz için kaydeder.
// Cevabı geciktirmemek için hataları yutuyoruz: günlük tutulamaması kullanıcıyı
// etkilememeli.
async function soruKaydet(
  c: any,
  yarisma: string | undefined,
  soru: string,
  sonuc: string,
  skor: number
): Promise<void> {
  try {
    await c.env.DB.prepare(
      `INSERT INTO question_log (competition_id, question, outcome, confidence) VALUES (?, ?, ?, ?)`
    ).bind(yarisma ?? "iha", soru, sonuc, skor).run();
  } catch {
    /* question_log yoksa sessizce geç (migration_v10 çalışmamış olabilir) */
  }
}

app.post("/api/chat", async (c) => {
  const { question, user_id, competition, gecmis } = await c.req.json<{
    question: string;
    user_id?: number;
    competition?: string;
    /** Aynı oturumdaki son soru-cevaplar — takip sorularını çözmek için. */
    gecmis?: GecmisOge[];
  }>();
  if (!question || question.trim().length < 3) {
    return c.json({ error: "Soru çok kısa." }, 400);
  }

  // Takip sorusuysa ("peki döner kanatta?") hem SSS eşleşmesi hem belge
  // araması, önceki soruyla birleştirilmiş metin üzerinden yapılır.
  const temizGecmis = (Array.isArray(gecmis) ? gecmis : [])
    .filter((g) => g && typeof g.soru === "string" && typeof g.cevap === "string")
    .slice(-3);
  const eslesmeSorusu = aramaSorusu(question, temizGecmis);

  // --- Önce SSS havuzu: aynı soru daha önce sorulup ekip tarafından
  // cevaplanmışsa dil modelini hiç çağırmadan o cevabı veriyoruz.
  try {
    const { results: sssler } = (await c.env.DB.prepare(
      `SELECT id, question, answer, sources FROM faqs WHERE competition_id = ?`
    )
      .bind(competition ?? "iha")
      .all()) as { results: Array<{ id: number; question: string; answer: string; sources: string | null }> };
    let enIyi: { skor: number; q: string; a: string; s: string | null } | null = null;
    for (const f of sssler || []) {
      const skor =
        ortakGovdeSayisi(eslesmeSorusu, f.question) >= 1 ? benzerlik(eslesmeSorusu, f.question) : 0;
      if (!enIyi || skor > enIyi.skor) enIyi = { skor, q: f.question, a: f.answer, s: f.sources ?? null };
    }
    if (enIyi && enIyi.skor >= SSS_ESIGI) {
      await soruKaydet(c, competition, question, "sss", enIyi.skor);

      // Kaydedilmiş kaynak varsa onu kullan (cevabın gerçek dayanağı).
      let kaynaklar: unknown[] = [];
      let ilgili = false;
      try {
        kaynaklar = enIyi.s ? JSON.parse(enIyi.s) : [];
      } catch {
        kaynaklar = [];
      }
      // Yoksa konuya en yakın şartname bölümünü bul — cevabın dayanağı değil,
      // "ilgili bölüm" olarak gösterilecek.
      if (!Array.isArray(kaynaklar) || kaynaklar.length === 0) {
        kaynaklar = await ilgiliKaynaklar(c.env, enIyi.q, competition);
        ilgili = kaynaklar.length > 0;
      }

      return c.json({
        ticket_id: null,
        answer: enIyi.a,
        confidence: enIyi.skor,
        sources: kaynaklar,
        needs_human: false,
        out_of_scope: false,
        from_faq: true,
        sources_ilgili: ilgili,
        matched_question: enIyi.q,
      });
    }
  } catch {
    /* SSS tablosu yoksa akışı bozmadan devam et */
  }

  const result = await answerFromKnowledgeBase(c.env, question, competition, temizGecmis);

  // Kapsam dışı sorular için talep AÇILMAZ: hakem kuyruğu yalnızca gerçekten
  // yarışmayla ilgili, kaynakta karşılığı bulunmayan sorular için ayrılmıştır.
  if (result.outOfScope) {
    await soruKaydet(c, competition, question, result.reason ?? "alan_disi", result.confidence);
    return c.json({
      ticket_id: null,
      answer: result.answer,
      confidence: result.confidence,
      sources: [],
      needs_human: false,
      out_of_scope: true,
      reason: result.reason ?? null,
    });
  }

  // Kaynakta karşılığı bulunamayan sorular ARTIK otomatik olarak hakem
  // kuyruğuna düşmüyor. Kullanıcı isterse cevabın altındaki "Bu soruyu uzmana
  // ilet" düğmesiyle kendisi talep açar. Eskiden her emin olunamayan soru
  // otomatik talep oluşturuyordu ve kuyruk, kimsenin takip etmediği yarım
  // sorularla doluyordu.
  let ticketId: number | null = null;
  if (!result.needsHuman) {
    const insertRes = await c.env.DB.prepare(
      `INSERT INTO tickets (user_id, type, category, question, ai_answer, ai_confidence, ai_sources, status)
       VALUES (?, 'soru', ?, ?, ?, ?, ?, 'ai_cevapladi')`
    )
      .bind(
        user_id ?? null,
        competition ?? "iha",
        question,
        result.answer,
        result.confidence,
        JSON.stringify(result.sources)
      )
      .run();
    ticketId = insertRes.meta.last_row_id as number;
  }

  await soruKaydet(
    c,
    competition,
    question,
    result.needsHuman ? "kaynakta_yok" : "cevaplandi",
    result.confidence
  );

  return c.json({
    ticket_id: ticketId,
    takip: temizGecmis.length > 0 && takipSorusuMu(question),
    answer: result.answer,
    confidence: result.confidence,
    sources: result.sources,
    needs_human: result.needsHuman,
    out_of_scope: false,
    reason: result.reason ?? null,
  });
});

// ---------------------------------------------------------------------------
// 👍/👎 geri bildirim. Not: "hayır" demek talebi otomatik olarak hakem
// kuyruğuna ATMAZ; yalnızca geri bildirim kaydedilir. Kullanıcı gerçekten
// uzmana iletmek isterse bunu düğmeyle kendisi yapar.
// ---------------------------------------------------------------------------
app.post("/api/tickets/:id/feedback", async (c) => {
  const id = c.req.param("id");
  const { helpful } = await c.req.json<{ helpful: boolean }>();
  try {
    await c.env.DB.prepare(
      `UPDATE tickets SET helpful = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(helpful ? 1 : 0, id)
      .run();
  } catch (err) {
    // Eskiden bu hata yutuluyordu: kullanıcı 👍'a basıyor, ekranda teşekkür
    // yazısı çıkıyor ama hiçbir yere kaydedilmiyordu. Artık açıkça söylüyoruz.
    return c.json(
      {
        error:
          "Geri bildirim kaydedilemedi: " +
          (err instanceof Error ? err.message : String(err)) +
          " (tickets.helpful kolonu eksikse: npm run db:migrate-v13:remote)",
      },
      500
    );
  }
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// MVP madde 4+5: elenme/karar gerekçesi görüntüleme + itiraz talebi açma
// ---------------------------------------------------------------------------
app.post("/api/itiraz", async (c) => {
  const body = await c.req.json<{
    user_id?: number;
    competition?: string;
    team_id?: string;
    application_id?: string;
    question: string;
    decision_reason?: string;
    related_ticket_id?: number;
  }>();

  if (!body.question) return c.json({ error: "Açıklama gerekli." }, 400);

  const insertRes = await c.env.DB.prepare(
    `INSERT INTO tickets (user_id, type, category, question, decision_reason, team_id, application_id, status)
     VALUES (?, 'itiraz', ?, ?, ?, ?, ?, 'insana_yonlendirildi')`
  )
    .bind(
      body.user_id ?? null,
      body.competition ?? "iha",
      body.question,
      body.decision_reason ?? null,
      body.team_id ?? null,
      body.application_id ?? null
    )
    .run();

  return c.json({ ticket_id: insertRes.meta.last_row_id, status: "insana_yonlendirildi" });
});

// ---------------------------------------------------------------------------
// MVP madde 6: hakem/koordinatör paneli - bekleyen talepleri görme, atama, cevaplama
// Artık kimlik doğrulama zorunlu (staff girişi yapmış olmak gerekir).
// ---------------------------------------------------------------------------
app.get("/api/tickets", requireAuth([...STAFF_ROLES]), async (c) => {
  const status = c.req.query("status");
  const comp = c.req.query("competition");
  const user = c.get("authUser" as never) as { uid: number; role: string };

  // Hakem yalnızca kendisine atanan yarışmaları görür. Koordinatör/admin için
  // kısıt yoktur; onlar isterse ?competition= ile kendileri daraltabilir.
  const izinli = await yetkiliYarismalar(c, user.uid);

  const kosullar: string[] = [];
  const parametreler: unknown[] = [];
  if (status) {
    kosullar.push("status = ?");
    parametreler.push(status);
  }
  if (izinli && izinli.length) {
    kosullar.push(`category IN (${izinli.map(() => "?").join(",")})`);
    parametreler.push(...izinli);
  }
  if (comp) {
    kosullar.push("category = ?");
    parametreler.push(comp);
  }
  const where = kosullar.length ? `WHERE ${kosullar.join(" AND ")}` : "";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM tickets ${where} ORDER BY created_at DESC`
  )
    .bind(...parametreler)
    .all();
  return c.json({ tickets: results, yetkili_yarismalar: izinli });
});

// Bir talebin, giriş yapan personelin yetki alanında olup olmadığını doğrular.
async function talepYetkisiVar(c: any, ticketId: string | undefined): Promise<boolean> {
  if (!ticketId) return false;
  const user = c.get("authUser" as never) as { uid: number };
  const izinli = await yetkiliYarismalar(c, user.uid);
  if (!izinli || !izinli.length) return true;
  const row = (await c.env.DB.prepare(`SELECT category FROM tickets WHERE id = ?`)
    .bind(ticketId)
    .first()) as { category: string | null } | null;
  return !!row && !!row.category && izinli.includes(row.category);
}

// Talep silme. Yetki alanı dışındaki bir talebi kimse silemez; ayrıca
// ticket_events yabancı anahtarla tickets'a bağlı olduğu için önce olay
// kayıtları temizlenir (yoksa "FOREIGN KEY constraint failed" alınır).
app.delete("/api/tickets/:id", requireAuth(["hakem", "koordinator", "admin"]), async (c) => {
  const id = c.req.param("id");
  if (!(await talepYetkisiVar(c, id))) {
    return c.json({ error: "Bu talep sizin sorumluluğunuzdaki yarışmalara ait değil." }, 403);
  }
  try {
    await c.env.DB.prepare(`DELETE FROM ticket_events WHERE ticket_id = ?`).bind(id).run();
  } catch {
    /* tablo yoksa sorun değil */
  }
  const r = await c.env.DB.prepare(`DELETE FROM tickets WHERE id = ?`).bind(id).run();
  if (!r.meta.changes) return c.json({ error: "Talep bulunamadı." }, 404);
  return c.json({ ok: true, silinen: Number(id) });
});

app.post("/api/tickets/:id/assign", requireAuth(["hakem", "koordinator", "admin"]), async (c) => {
  const id = c.req.param("id");
  if (!(await talepYetkisiVar(c, id))) {
    return c.json({ error: "Bu talep sizin sorumluluğunuzdaki yarışmalara ait değil." }, 403);
  }
  const { assigned_to } = await c.req.json<{ assigned_to: number }>();
  await c.env.DB.prepare(`UPDATE tickets SET status = 'atandi', assigned_to = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(assigned_to, id)
    .run();
  return c.json({ ok: true });
});

app.post("/api/tickets/:id/answer", requireAuth(["hakem", "koordinator", "admin"]), async (c) => {
  const id = c.req.param("id");
  if (!(await talepYetkisiVar(c, id))) {
    return c.json({ error: "Bu talep sizin sorumluluğunuzdaki yarışmalara ait değil." }, 403);
  }
  const { human_answer } = await c.req.json<{ human_answer: string }>();
  if (!human_answer || !human_answer.trim()) {
    return c.json({ error: "Cevap boş olamaz." }, 400);
  }
  // Aynı uç hem ilk cevabı hem sonraki düzenlemeleri kaydeder; hakem
  // gönderdikten sonra cevabını düzeltebilir.
  await c.env.DB.prepare(
    `UPDATE tickets SET status = 'cevaplandi', human_answer = ?, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(human_answer.trim(), id)
    .run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Bir talebe benzeyen önceki talepler: hakem cevap yazarken "bu soru daha önce
// sorulmuş muydu, ne cevap verilmişti" bağlamını görür. Aynı takımın önceki
// soruları ayrıca işaretlenir.
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id/benzer", requireAuth([...STAFF_ROLES]), async (c) => {
  const id = c.req.param("id");
  const hedef = (await c.env.DB.prepare(
    `SELECT id, question, category, team_id FROM tickets WHERE id = ?`
  )
    .bind(id)
    .first()) as { id: number; question: string; category: string | null; team_id: string | null } | null;
  if (!hedef) return c.json({ benzerler: [] });

  const { results } = (await c.env.DB.prepare(
    `SELECT id, question, human_answer, team_id, status, created_at
       FROM tickets
      WHERE id != ? AND category IS ? AND human_answer IS NOT NULL
      ORDER BY created_at DESC LIMIT 200`
  )
    .bind(id, hedef.category)
    .all()) as {
    results: Array<{
      id: number; question: string; human_answer: string | null;
      team_id: string | null; status: string; created_at: string;
    }>;
  };

  const benzerler = (results || [])
    .map((t) => ({ ...t, skor: benzerlik(hedef.question, t.question), ayni_takim: !!t.team_id && t.team_id === hedef.team_id }))
    .filter((t) => t.skor >= 0.35 || t.ayni_takim)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 3);

  // Aynı soru kaç kez gelmiş? Çok tekrarlanıyorsa SSS havuzuna alınmalı.
  const tekrar = (results || []).filter((t) => benzerlik(hedef.question, t.question) >= 0.5).length;
  return c.json({ benzerler, tekrar_sayisi: tekrar });
});

// ---------------------------------------------------------------------------
// SSS havuzu: Destek ekibi bir talebi cevapladıktan sonra "SSS'ye ekle" derse
// bu soru+cevap, o yarışmaya özel SSS havuzuna düşer ve sonraki yarışmacılar
// chat ekranında bunu hazır öneri olarak görür (AI'ye tekrar sormaya gerek
// kalmadan doğrudan cevabı gösterir).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Hangi yarışmaların bilgi tabanı gerçekten hazır? (herkese açık)
// Yarışma listesindeki "aktif" durumu artık kodda elle yazılmıyor: aktif ve
// içine parça işlenmiş bir belgesi olan her yarışma otomatik olarak açılır.
// Böylece İçerik Yöneticisi panelinden PDF yüklemek yeni bir yarışmayı
// gerçekten hayata geçirir — geliştirici müdahalesi gerekmez.
// ---------------------------------------------------------------------------
app.get("/api/ready-competitions", async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT competition_id, SUM(COALESCE(chunk_count, 0)) AS n FROM documents
        WHERE status = 'aktif' AND COALESCE(chunk_count, 0) > 0
        GROUP BY competition_id`
    ).all<{ competition_id: string; n: number }>();
    const rows = results || [];
    // Panelden yüklenen parçalar ayrı sayılıyor: ilk 533 parça betikle
    // yüklendiği için document_chunks tablosunda yer almıyor. Arayüz
    // 533 tabanının üstüne panelden geleni ekliyor, böylece yeni bir belge
    // yüklendiğinde ana sayfadaki kaynak sayısı gerçekten artıyor.
    let panelChunks = 0;
    try {
      const row = await c.env.DB.prepare(
        `SELECT COUNT(*) AS n FROM document_chunks dc
           JOIN documents d ON d.id = dc.document_id
          WHERE d.status = 'aktif'`
      ).first<{ n: number }>();
      panelChunks = Number(row?.n || 0);
    } catch {
      panelChunks = 0;
    }
    return c.json({
      ready: rows.map((r) => r.competition_id),
      panel_chunks: panelChunks,
    });
  } catch (err) {
    // documents tablosu henüz yoksa listeyi boş döndür; istemci kendi
    // varsayılan listesine geri düşer.
    return c.json({ ready: [] });
  }
});

app.get("/api/faqs", async (c) => {
  const competition = c.req.query("competition") ?? "iha";
  const { results } = await c.env.DB.prepare(
    `SELECT id, question, answer FROM faqs WHERE competition_id = ? ORDER BY created_at DESC`
  )
    .bind(competition)
    .all();
  return c.json({ faqs: results });
});

app.post("/api/tickets/:id/promote-to-faq", requireAuth([...STAFF_ROLES]), async (c) => {
  const id = c.req.param("id");
  if (!(await talepYetkisiVar(c, id))) {
    return c.json({ error: "Bu talep sizin sorumluluğunuzdaki yarışmalara ait değil." }, 403);
  }
  const ticket = await c.env.DB.prepare(
    `SELECT question, human_answer, ai_answer, ai_sources, category FROM tickets WHERE id = ?`
  )
    .bind(id)
    .first<{
      question: string;
      human_answer: string | null;
      ai_answer: string | null;
      ai_sources: string | null;
      category: string | null;
    }>();

  if (!ticket) return c.json({ error: "Talep bulunamadı." }, 404);
  const answer = ticket.human_answer ?? ticket.ai_answer;
  if (!answer) return c.json({ error: "Bu talebin henüz bir cevabı yok." }, 400);

  try {
    await c.env.DB.prepare(
      `INSERT INTO faqs (competition_id, question, answer, source_ticket_id, sources) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(ticket.category ?? "iha", ticket.question, answer, id, ticket.ai_sources ?? null)
      .run();
  } catch {
    // sources kolonu yoksa (migration_v12 çalışmadıysa) eski biçimde ekle —
    // SSS'ye eklemek, kaynak kopyalanamadı diye başarısız olmamalı.
    await c.env.DB.prepare(
      `INSERT INTO faqs (competition_id, question, answer, source_ticket_id) VALUES (?, ?, ?, ?)`
    )
      .bind(ticket.category ?? "iha", ticket.question, answer, id)
      .run();
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Yarışmacı öz-takip ekranı: "İtirazım/talebim ne durumda?" — takım ID,
// başvuru ID veya talep numarasıyla sorgulama. Sadece talebin sahibiyle
// paylaşılması güvenli alanlar döner (hakem paneline özel alanlar hariç).
// ---------------------------------------------------------------------------
// Giriş yapmış kullanıcının kendi talepleri. Talep sorgulama ekranından farkı:
// takım/başvuru numarası istemez, kimlik token'dan gelir — başkasının talebini
// görmek mümkün değil.
app.get("/api/sorularim", requireAuth(), async (c) => {
  const user = c.get("authUser" as never) as { uid: number };
  const { results } = await c.env.DB.prepare(
    `SELECT id, type, category, question, status, ai_answer, human_answer, decision_reason,
            team_id, application_id, created_at, updated_at
     FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`
  )
    .bind(user.uid)
    .all();
  return c.json({ tickets: results });
});

app.get("/api/my-tickets", async (c) => {
  const ticketId = c.req.query("ticket_id");
  const teamId = c.req.query("team_id");
  const applicationId = c.req.query("application_id");

  if (!ticketId && !teamId && !applicationId) {
    return c.json({ error: "Talep numarası, takım ID veya başvuru ID girin." }, 400);
  }

  let query;
  if (ticketId) {
    query = c.env.DB.prepare(
      `SELECT id, type, question, status, human_answer, decision_reason, team_id, application_id, created_at, updated_at
       FROM tickets WHERE id = ?`
    ).bind(ticketId);
  } else if (teamId && applicationId) {
    query = c.env.DB.prepare(
      `SELECT id, type, question, status, human_answer, decision_reason, team_id, application_id, created_at, updated_at
       FROM tickets WHERE team_id = ? AND application_id = ? ORDER BY created_at DESC`
    ).bind(teamId, applicationId);
  } else {
    query = c.env.DB.prepare(
      `SELECT id, type, question, status, human_answer, decision_reason, team_id, application_id, created_at, updated_at
       FROM tickets WHERE team_id = ? OR application_id = ? ORDER BY created_at DESC`
    ).bind(teamId ?? applicationId, applicationId ?? teamId);
  }

  const { results } = await query.all();
  return c.json({ tickets: results });
});

// Basit kullanıcı listesi (yarışmacı demo rol seçimi için - staff artık login ile girer)
app.get("/api/users", async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id, name, role, team_name FROM users WHERE role = 'yarisci'`).all();
  return c.json({ users: results });
});

// ===========================================================================
// İçerik Yöneticisi: AKIŞ 02 — şartname/kılavuz/SSS yükleme, eski kaynağı
// otomatik pasife alma, bilgi havuzunu güncelleme. Belge geçerlilik takibi
// (status: isleniyor -> aktif, eski aktif -> pasif) MVP madde 2 gereksinimi.
// ===========================================================================

app.get("/api/admin/documents", requireAuth(["icerik_yoneticisi", "admin"]), async (c) => {
  const competition = c.req.query("competition");
  const query = competition
    ? c.env.DB.prepare(`SELECT * FROM documents WHERE competition_id = ? ORDER BY uploaded_at DESC`).bind(competition)
    : c.env.DB.prepare(`SELECT * FROM documents ORDER BY uploaded_at DESC`);
  const { results } = await query.all();
  return c.json({ documents: results });
});

// Belge yükleme: PDF + başlık + yarışma + versiyon. R2'ye ham dosyayı koyar,
// unpdf ile metni çıkarır, chunker.ts ile madde etiketli parçalara böler,
// document_chunks tablosuna "embedded=0" olarak yazar (asıl embed işlemi
// process-batch endpoint'i ile parça parça yapılır - Workers CPU limiti).
app.post("/api/admin/documents", requireAuth(["icerik_yoneticisi", "admin"]), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const title = form.get("title");
  const competitionId = form.get("competition_id");
  const version = form.get("version");

  // Not: `file instanceof File` kullanılmıyor — workers-types ortamında `File`
  // global tipi tanımlı olmadığı için tsc hata veriyordu. Bunun yerine yüklenen
  // değeri gereken iki üyesiyle (name + arrayBuffer) tipliyoruz.
  const upload = file as unknown as { name: string; arrayBuffer: () => Promise<ArrayBuffer> } | null;
  const isFile = !!upload && typeof upload.arrayBuffer === "function";
  if (!isFile || typeof title !== "string" || typeof competitionId !== "string") {
    return c.json({ error: "Dosya, başlık ve yarışma seçimi gerekli." }, 400);
  }

  const authUser = c.get("authUser" as never) as { uid: number };
  const r2Key = `${competitionId}/${Date.now()}-${upload.name}`;
  const arrayBuf = await upload.arrayBuffer();
  await c.env.DOCS_BUCKET.put(r2Key, arrayBuf);

  let pageTexts: string[] = [];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(arrayBuf));
    const { text } = await extractText(pdf, { mergePages: false });
    pageTexts = Array.isArray(text) ? text : [text];
  } catch (err) {
    return c.json({ error: `PDF okunamadı: ${(err as Error).message}` }, 400);
  }

  const rawChunks = chunkPages(pageTexts);
  if (rawChunks.length === 0) {
    return c.json({ error: "Belgeden metin çıkarılamadı (taranmış görüntü PDF olabilir)." }, 400);
  }

  const docInsert = await c.env.DB.prepare(
    `INSERT INTO documents (competition_id, title, filename, version, status, total_chunks, uploaded_by, r2_key)
     VALUES (?, ?, ?, ?, 'isleniyor', ?, ?, ?)`
  )
    .bind(competitionId, title, upload.name, version ?? null, rawChunks.length, authUser.uid, r2Key)
    .run();

  const documentId = docInsert.meta.last_row_id;

  // document_chunks'a toplu yazım (embed henüz yok)
  const stmts = rawChunks.map((chunk, idx) =>
    c.env.DB.prepare(
      `INSERT INTO document_chunks (document_id, vector_id, page, madde_no, madde_title, text) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(documentId, `doc${documentId}-${idx}`, chunk.page, chunk.madde_no, chunk.madde_title, chunk.text)
  );
  await c.env.DB.batch(stmts);

  return c.json({ document_id: documentId, total_chunks: rawChunks.length });
});

// Frontend, total_chunks / BATCH_SIZE kadar bu endpoint'i sırayla çağırır
// (ilerleme çubuğu için progress döner). Son batch bittiğinde belgeyi 'aktif'
// yapar ve aynı yarışmadaki önceki aktif belge(ler)i 'pasif'e çeker + eski
// vektörlerini Vectorize'dan siler (AKIŞ 02'nin tam karşılığı).
app.post("/api/admin/documents/:id/process-batch", requireAuth(["icerik_yoneticisi", "admin"]), async (c) => {
  const documentId = c.req.param("id");

  const doc = await c.env.DB.prepare(`SELECT * FROM documents WHERE id = ?`).bind(documentId).first<DocumentRow>();
  if (!doc) return c.json({ error: "Belge bulunamadı." }, 404);

  const { results: pending } = await c.env.DB.prepare(
    `SELECT * FROM document_chunks WHERE document_id = ? AND embedded = 0 LIMIT ?`
  )
    .bind(documentId, BATCH_SIZE)
    .all<{ id: number; vector_id: string; page: number | null; madde_no: string | null; madde_title: string | null; text: string }>();

  if (pending.length > 0) {
    const embedRes = (await c.env.AI.run(EMBEDDING_MODEL, {
      text: pending.map((p) => p.text),
    })) as { data: number[][] };

    const vectors = pending.map((p, i) => ({
      id: p.vector_id,
      values: embedRes.data[i],
      metadata: {
        source_file: doc.filename,
        source_title: doc.title,
        doc_type: "sartname",
        competition_id: doc.competition_id,
        page: p.page ?? 0,
        madde_no: p.madde_no,
        madde_title: p.madde_title,
        text: p.text.slice(0, 800),
      },
    }));

    // madde_no/madde_title null olabiliyor; Vectorize metadata tipi null kabul
    // etmediği için cast ediyoruz (çalışma zamanında null sorun değil).
    await c.env.VECTORIZE_INDEX.upsert(vectors as unknown as Parameters<typeof c.env.VECTORIZE_INDEX.upsert>[0]);
    await c.env.DB.batch(
      pending.map((p) => c.env.DB.prepare(`UPDATE document_chunks SET embedded = 1 WHERE id = ?`).bind(p.id))
    );

    await c.env.DB.prepare(`UPDATE documents SET chunk_count = chunk_count + ? WHERE id = ?`)
      .bind(pending.length, documentId)
      .run();
  }

  const remaining = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM document_chunks WHERE document_id = ? AND embedded = 0`
  )
    .bind(documentId)
    .first<{ cnt: number }>();

  const done = (remaining?.cnt ?? 0) === 0;

  if (done) {
    // Aynı yarışmanın önceki aktif belgelerini pasife çek, eski vektörlerini sil
    const { results: oldActive } = await c.env.DB.prepare(
      `SELECT id FROM documents WHERE competition_id = ? AND status = 'aktif' AND id != ?`
    )
      .bind(doc.competition_id, documentId)
      .all<{ id: number }>();

    for (const old of oldActive) {
      const { results: oldChunks } = await c.env.DB.prepare(
        `SELECT vector_id FROM document_chunks WHERE document_id = ?`
      )
        .bind(old.id)
        .all<{ vector_id: string }>();
      if (oldChunks.length > 0) {
        await c.env.VECTORIZE_INDEX.deleteByIds(oldChunks.map((oc) => oc.vector_id));
      }
      await c.env.DB.prepare(`UPDATE documents SET status = 'pasif' WHERE id = ?`).bind(old.id).run();
    }

    await c.env.DB.prepare(`UPDATE documents SET status = 'aktif' WHERE id = ?`).bind(documentId).run();
  }

  const totalDone = doc.total_chunks - (remaining?.cnt ?? 0);
  return c.json({ done, processed: totalDone, total: doc.total_chunks });
});

app.post("/api/admin/documents/:id/toggle-status", requireAuth(["icerik_yoneticisi", "admin"]), async (c) => {
  const id = c.req.param("id");
  const { status } = await c.req.json<{ status: "aktif" | "pasif" }>();
  await c.env.DB.prepare(`UPDATE documents SET status = ? WHERE id = ?`).bind(status, id).run();
  return c.json({ ok: true });
});

// ===========================================================================
// Sistem Yöneticisi: basit analitik gösterge paneli — toplam soru sayısı,
// %insana yönlendirme oranı, en çok sorulan konular, 👍/👎 oranı.
// ===========================================================================
app.get("/api/admin/stats", requireAuth(["admin", "icerik_yoneticisi"]), async (c) => {
  // Eskiden üç sorgudan biri patlarsa (eksik kolon, eksik migration) tüm uç
  // nokta 500 dönüyordu ve ekranda sebebi yazmayan kırmızı bir kutu kalıyordu.
  // Artık her sorgu ayrı korunuyor: biri düşse de geri kalan istatistikler
  // görünüyor ve neyin çalışmadığı "uyarilar" içinde açıkça yazıyor.
  const uyarilar: string[] = [];

  let totals: { total: number; human_routed: number; helpful_yes: number; helpful_no: number } | null = null;
  try {
    totals = await c.env.DB.prepare(
      `SELECT
         COUNT(*) as total,
         SUM(CASE WHEN status IN ('insana_yonlendirildi','atandi','cevaplandi') THEN 1 ELSE 0 END) as human_routed,
         SUM(CASE WHEN helpful = 1 THEN 1 ELSE 0 END) as helpful_yes,
         SUM(CASE WHEN helpful = 0 THEN 1 ELSE 0 END) as helpful_no
       FROM tickets WHERE type = 'soru'`
    ).first();
  } catch (err) {
    uyarilar.push(`Özet sayılar okunamadı: ${err instanceof Error ? err.message : String(err)}`);
  }

  let topQuestions: Array<{ q: string; cnt: number }> = [];
  try {
    const r = await c.env.DB.prepare(
      `SELECT LOWER(TRIM(question)) as q, COUNT(*) as cnt
       FROM tickets WHERE type = 'soru' GROUP BY q ORDER BY cnt DESC LIMIT 10`
    ).all();
    topQuestions = r.results as Array<{ q: string; cnt: number }>;
  } catch (err) {
    uyarilar.push(`En çok sorulanlar okunamadı: ${err instanceof Error ? err.message : String(err)}`);
  }

  let byCategory: Array<{ category: string | null; cnt: number }> = [];
  try {
    const r = await c.env.DB.prepare(
      `SELECT category, COUNT(*) as cnt FROM tickets GROUP BY category ORDER BY cnt DESC`
    ).all();
    byCategory = r.results as Array<{ category: string | null; cnt: number }>;
  } catch (err) {
    uyarilar.push(`Yarışma dağılımı okunamadı: ${err instanceof Error ? err.message : String(err)}`);
  }

  return c.json({
    total: totals?.total ?? 0,
    human_routed: totals?.human_routed ?? 0,
    human_routed_pct: totals?.total ? Math.round(((totals.human_routed ?? 0) / totals.total) * 100) : 0,
    helpful_yes: totals?.helpful_yes ?? 0,
    helpful_no: totals?.helpful_no ?? 0,
    top_questions: topQuestions,
    by_category: byCategory,
    uyarilar,
  });
});

// ---------------------------------------------------------------------------
// KAYNAĞA TIKLAYINCA PDF (jüri notu 7)
// Cevabın altındaki "şartname · s.34" rozeti artık bir bağlantı: aynı sunucudan
// PDF'i açıyoruz ve #page=34 ile tarayıcının görüntüleyicisini doğru sayfaya
// gönderiyoruz. Kaynak dosyası yüklenmemişse rozet düz metin kalır — bu yüzden
// arayüz önce /api/kaynaklar ile hangi başlıkların açılabilir olduğunu sorar.
// ---------------------------------------------------------------------------

// İlk beş İHA belgesi çevrimdışı hazırlanıp indekse aktarılmıştı; ham PDF'leri
// R2'de değil, doğrudan public/kaynak/ altında duruyor ve worker ile birlikte
// yayınlanıyor. Böylece "kaynağa tıkla, şartname açılsın" için kimsenin elle bir
// şey yüklemesi gerekmiyor.
const STATIK_KAYNAKLAR: Record<string, string> = {
  "İHA Yarışmaları Şartnamesi 2026": "/kaynak/iha-sartnamesi-2026.pdf",
  "Sabit-Döner Kanat Görev Videosu Hazırlama Kılavuzu": "/kaynak/sabit-doner-gorev-videosu.pdf",
  "Serbest Görev Kategorisi Görev Videosu Hazırlama Kılavuzu": "/kaynak/serbest-gorev-videosu.pdf",
  "Sabit-Döner PSR Hazırlama Kılavuzu": "/kaynak/sabit-doner-psr.pdf",
  "Serbest Görev PSR Hazırlama Kılavuzu": "/kaynak/serbest-gorev-psr.pdf",
};

/** Bir kaynak başlığının R2'deki karşılığını bulur. */
async function kaynakBul(c: any, baslik: string): Promise<{ r2_key: string; filename: string | null } | null> {
  try {
    const a = (await c.env.DB.prepare(
      `SELECT r2_key, filename FROM source_files WHERE source_title = ? ORDER BY id DESC LIMIT 1`
    ).bind(baslik).first()) as { r2_key: string; filename: string | null } | null;
    if (a?.r2_key) return a;
  } catch { /* tablo yoksa devam */ }
  try {
    const b = (await c.env.DB.prepare(
      `SELECT r2_key, filename FROM documents WHERE title = ? AND r2_key IS NOT NULL
       ORDER BY (status = 'aktif') DESC, id DESC LIMIT 1`
    ).bind(baslik).first()) as { r2_key: string; filename: string | null } | null;
    if (b?.r2_key) return b;
  } catch { /* yoksa devam */ }
  return null;
}

/** Arayüzün hangi rozetleri bağlantı yapacağını bilmesi için açılabilir başlıklar. */
app.get("/api/kaynaklar", async (c) => {
  const basliklar = new Set<string>(Object.keys(STATIK_KAYNAKLAR));
  try {
    const { results } = await c.env.DB.prepare(`SELECT DISTINCT source_title AS t FROM source_files`).all();
    for (const r of results as Array<{ t: string }>) basliklar.add(r.t);
  } catch { /* yoksa boş */ }
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT DISTINCT title AS t FROM documents WHERE r2_key IS NOT NULL`
    ).all();
    for (const r of results as Array<{ t: string }>) basliklar.add(r.t);
  } catch { /* yoksa boş */ }
  return c.json({ basliklar: [...basliklar] });
});

/** PDF'i tarayıcıda açar. ?indir=1 verilirse indirtir. */
app.get("/api/kaynak", async (c) => {
  const baslik = c.req.query("baslik") ?? "";
  const indir = c.req.query("indir") === "1";
  if (!baslik) return c.json({ error: "baslik parametresi gerekli." }, 400);

  // Önce worker ile birlikte yayınlanan statik PDF'ler.
  const statik = STATIK_KAYNAKLAR[baslik];
  if (statik) {
    const url = new URL(c.req.url);
    url.pathname = statik;
    url.search = "";
    const res = await c.env.ASSETS.fetch(new Request(url.toString(), { method: "GET" }));
    if (res.ok) {
      const h2 = new Headers(res.headers);
      h2.set("Content-Type", "application/pdf");
      h2.set("Content-Disposition", `${indir ? "attachment" : "inline"}; filename="${statik.split("/").pop()}"`);
      h2.set("Cache-Control", "public, max-age=3600");
      return new Response(res.body, { status: 200, headers: h2 });
    }
  }

  const kayit = await kaynakBul(c, baslik);
  if (!kayit) {
    return c.json(
      { error: `"${baslik}" için kaynak dosyası henüz yüklenmemiş. İçerik yöneticisi panelinden yükleyebilirsiniz.` },
      404
    );
  }

  const obj = await c.env.DOCS_BUCKET.get(kayit.r2_key);
  if (!obj) return c.json({ error: "Dosya depoda bulunamadı." }, 404);

  const ad = (kayit.filename || baslik).replace(/[^\w.\-]+/g, "_");
  return new Response(obj.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${indir ? "attachment" : "inline"}; filename="${ad}"`,
      // Şartname sık değişmez; tarayıcı önbelleği sayfa atlamalarını hızlandırır.
      "Cache-Control": "public, max-age=3600",
    },
  });
});

/** Var olan bir kaynak başlığına ham PDF bağlama (yeniden parçalama YAPMAZ). */
app.post("/api/admin/kaynak-dosyasi", requireAuth(["icerik_yoneticisi", "admin"]), async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  const baslik = form.get("source_title");
  const yarisma = form.get("competition_id");
  const upload = file as unknown as { name: string; arrayBuffer: () => Promise<ArrayBuffer> } | null;
  if (!upload || typeof upload.arrayBuffer !== "function" || typeof baslik !== "string" || typeof yarisma !== "string") {
    return c.json({ error: "Dosya, kaynak başlığı ve yarışma gerekli." }, 400);
  }
  const r2Key = `kaynak/${yarisma}/${Date.now()}-${upload.name}`;
  await c.env.DOCS_BUCKET.put(r2Key, await upload.arrayBuffer());
  await c.env.DB.prepare(
    `INSERT INTO source_files (competition_id, source_title, filename, r2_key) VALUES (?, ?, ?, ?)`
  ).bind(yarisma, baslik, upload.name, r2Key).run();
  return c.json({ ok: true, source_title: baslik });
});

/** Cevaplarda hangi kaynak başlıklarının geçtiği — yükleme ekranında liste için. */
app.get("/api/admin/kaynak-basliklari", requireAuth(["icerik_yoneticisi", "admin"]), async (c) => {
  const yarisma = c.req.query("competition");
  const { results } = await c.env.DB.prepare(
    `SELECT DISTINCT source_title AS baslik FROM source_files WHERE competition_id = ?`
  ).bind(yarisma ?? "iha").all();
  return c.json({ yuklu: (results as Array<{ baslik: string }>).map((r) => r.baslik) });
});

// ---------------------------------------------------------------------------
// YARIŞMA BAZLI SORU ANALİZİ
// "Bu yarışmada en çok ne merak ediliyor?" sorusunu talepler tablosundan
// cevaplayamıyorduk: orada yalnızca uzmana iletilen sorular var. Artık sorulan
// her soru question_log'a düşüyor ve burada benzerlerini kümeleyip sıralıyoruz.
// ---------------------------------------------------------------------------
app.get("/api/admin/analiz", requireAuth([...STAFF_ROLES]), async (c) => {
  const yarisma = c.req.query("competition") ?? null;
  const gun = Number(c.req.query("gun") ?? 90);

  let sorular: Array<{ question: string; outcome: string | null }> = [];
  try {
    const st = yarisma
      ? c.env.DB.prepare(
          `SELECT question, outcome FROM question_log
           WHERE competition_id = ? AND created_at >= datetime('now', ?) ORDER BY id DESC LIMIT 800`
        ).bind(yarisma, `-${gun} days`)
      : c.env.DB.prepare(
          `SELECT question, outcome FROM question_log
           WHERE created_at >= datetime('now', ?) ORDER BY id DESC LIMIT 800`
        ).bind(`-${gun} days`);
    const { results } = await st.all();
    sorular = results as Array<{ question: string; outcome: string | null }>;
  } catch {
    return c.json({ hazir: false, not: "question_log tablosu yok — npm run db:migrate-v10:remote çalıştırın." });
  }

  // Aç gözlü kümeleme: her soruyu mevcut kümelerden yeterince benzer olanın
  // içine at, yoksa yeni küme başlat. Tam kelime eşleşmesi yerine gövde+trigram
  // benzerliği kullandığımız için "ağırlık sınırı" ve "ağırlığı kaç kg" birleşir.
  const KUME_ESIGI = 0.6;
  type Kume = { ornek: string; adet: number; cevapsiz: number; ornekler: string[] };
  const kumeler: Kume[] = [];
  for (const s of sorular) {
    const cevapsiz = s.outcome === "kaynakta_yok" ? 1 : 0;
    let yerlesti = false;
    for (const k of kumeler) {
      if (benzerlik(s.question, k.ornek) >= KUME_ESIGI) {
        k.adet++;
        k.cevapsiz += cevapsiz;
        if (k.ornekler.length < 3 && !k.ornekler.includes(s.question)) k.ornekler.push(s.question);
        yerlesti = true;
        break;
      }
    }
    if (!yerlesti) kumeler.push({ ornek: s.question, adet: 1, cevapsiz, ornekler: [s.question] });
  }
  kumeler.sort((a, b) => b.adet - a.adet);

  const sayac: Record<string, number> = {};
  for (const s of sorular) sayac[s.outcome ?? "bilinmiyor"] = (sayac[s.outcome ?? "bilinmiyor"] ?? 0) + 1;

  return c.json({
    hazir: true,
    yarisma,
    gun,
    toplam_soru: sorular.length,
    dagilim: sayac,
    en_cok_merak_edilenler: kumeler.slice(0, 12).map((k) => ({
      soru: k.ornek,
      adet: k.adet,
      cevapsiz: k.cevapsiz,
      ornekler: k.ornekler,
    })),
    // Kaynakta karşılığı olmayan ama tekrar tekrar sorulanlar: şartnamede
    // gerçekten eksik olan konular. İçerik ekibine en değerli sinyal bu.
    kaynakta_olmayan_tekrarlayanlar: kumeler
      .filter((k) => k.cevapsiz >= 2)
      .slice(0, 8)
      .map((k) => ({ soru: k.ornek, adet: k.adet, cevapsiz: k.cevapsiz })),
  });
});

// Statik frontend (public/) her şeyin geri kalanını servis eder
app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
