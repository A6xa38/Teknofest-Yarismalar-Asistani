import type { Env, VectorMetadata } from "./types";

const EMBEDDING_MODEL = "@cf/baai/bge-m3";
const LLM_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// Bu eşiğin altındaki en iyi eşleşme skoru = "AI yeterince emin değil" ->
// soru otomatik olarak insana (hakem/koordinatör) yönlendirilir.
export const CONFIDENCE_THRESHOLD = 0.45;

// Bunun da altındaki skor = soru bu yarışmanın belgeleriyle hiç ilgili değil.
// Bu durumda insana YÖNLENDİRİLMEZ; çünkü hakem kuyruğunu alakasız isteklerle
// (şiir yaz, kod yaz, sohbet et) doldurmanın anlamı yok. Reddedilir.
export const SCOPE_THRESHOLD = 0.28;

// 1. aşama: model çağırmadan, açıkça alan dışı olan istekleri yakalar.
// Amaç doğruluk değil, ucuz ve kesin eleme: bu kalıplar şartname sorusu olamaz.
// DİKKAT: JavaScript'te \b kelime sınırı SADECE [A-Za-z0-9_] üzerinden çalışır.
// Bu yüzden "şiir", "şarkı", "çevir", "önceki" gibi TÜRKÇE KARAKTERLE BAŞLAYAN
// kelimelerde /\bşiir\b/ hiçbir zaman eşleşmez; filtre sessizce devre dışı kalır.
// ("bana bir şiir yaz" eskiden bu yüzden filtreden geçiyordu.)
// Çözüm: Unicode harf/rakam farkındalıklı kendi sınırımız.
const B0 = "(?<![\\p{L}\\p{N}])";
const B1 = "(?![\\p{L}\\p{N}])";

/** Tam kelime: sadece verilen biçimler. */
function kelime(...alts: string[]): string {
  return B0 + "(?:" + alts.join("|") + ")" + B1;
}
/** Kök + Türkçe ek: "yaz" -> yaz, yazar, yazabilir, yazsana ... */
function kok(...alts: string[]): string {
  return B0 + "(?:" + alts.join("|") + ")" + "\\p{L}{0,10}" + B1;
}
const yakin = (n: number) => `[\\s\\S]{0,${n}}`;
const rx = (body: string) => new RegExp(body, "iu");

const URETIM_FIILI = ["yaz", "üret", "uret", "anlat", "söyle", "soyle", "kur", "oluştur", "olustur"];
// "rap" burada TAM kelime: kök olarak alınırsa "rapor" da eşleşir ve
// "raporu yaz" gibi gerçek şartname soruları yanlışlıkla elenir.
const EDEBI_KOK = ["şiir", "siir", "hikâye", "hikaye", "öykü", "oyku", "masal", "şarkı", "sarki", "fıkra", "fikra", "kompozisyon", "senaryo", "espri", "şaka"];
const EDEBI_TAM = ["rap", "deneme"];
const edebi = () => "(?:" + kok(...EDEBI_KOK) + "|" + kelime(...EDEBI_TAM) + ")";

const OFF_TOPIC_PATTERNS: RegExp[] = [
  // "bana bir şiir yaz" / "şiir yazar mısın"
  rx(edebi() + yakin(24) + kok(...URETIM_FIILI)),
  // "yazar mısın bir şiir"
  rx(kok(...URETIM_FIILI) + yakin(24) + edebi()),
  // kod yazdırma
  rx(kok("kod", "program", "script", "fonksiyon", "algoritma") + yakin(24) + kok("yaz", "üret", "uret")),
  rx(kok("python", "javascript", "java", "html", "sql") + yakin(28) + kok("yaz", "kod", "örnek", "ornek")),
  // çeviri
  rx(kok("çevir", "cevir", "tercüme", "tercume") + yakin(28) + kok("et", "eder", "edebilir", "yap", "misin", "mısın", "misiniz", "mısınız")),
  // tamamen alakasız konular
  rx(kelime("tarif", "tarifi", "yemek", "film", "dizi", "maç", "mac", "burç", "burc") + "|" + kok("hava durum")),
  // sohbet açılışı / boş mesaj
  rx("^" + yakin(12) + kok("nasılsın", "nasilsin", "naber", "merhaba", "selam", "teşekkür", "tesekkur", "sağol", "sagol") + "\\s*[?.!]*$"),
  // modele kimlik sorma
  rx(kok("kendini tanıt", "kendini tanit", "sen kimsin", "hangi modelsin", "gpt", "chatgpt", "yapay zeka mısın", "yapay zeka misin")),
  // prompt injection
  rx(kok("önceki", "onceki", "yukarıdaki", "yukaridaki", "tüm", "tum") + yakin(24) + kok("talimat", "talimatlar", "prompt", "kural", "kurallar") + yakin(24) + kok("unut", "yoksay", "görmezden", "gormezden", "boşver", "bosver")),
  rx(kok("unut", "yoksay") + yakin(28) + kok("talimat", "kural", "şartname", "sartname")),
];

/** Türkçe büyük/küçük harf tuzağı: "ŞİİR" -> "şiir" (İ -> i, I -> ı). */
function trKucuk(s: string): string {
  return s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

export function looksOffTopic(question: string): boolean {
  const q = question.trim();
  if (q.length < 3) return true;
  const alt = trKucuk(q);
  return OFF_TOPIC_PATTERNS.some((re) => re.test(q) || re.test(alt));
}

// ---------------------------------------------------------------------------
// TAKİP SORUSU (bağlam taşıma)
// "Azami kalkış ağırlığı nedir?" -> "peki döner kanatta?" gibi sorular tek
// başlarına anlamsız: içinde ne "ağırlık" ne "kalkış" geçiyor, dolayısıyla
// belgede aranacak bir şey yok. Bu yüzden önceki soruyu arama sorgusuna
// ekliyoruz ve konuşma geçmişini modele de veriyoruz.
// ---------------------------------------------------------------------------
export interface GecmisOge {
  soru: string;
  cevap: string;
}

// Yalnızca AÇIKÇA önceki soruya bağlanan ifadelerde birleştirme yapıyoruz.
// Her kısa soruyu birleştirmek, yeni bir konuya geçildiğinde aramayı
// bozardı ("telemetri zorunlu mu?" başlı başına bir sorudur).
const TAKIP_ISARETLERI =
  /(^|[\s,])(peki|pekii|ya|yani|ayrıca|ek olarak|bunun|bunu|buna|bunda|bundan|şunun|şunu|şuna|onun|onu|ona|onda|ondan|orada|oradaki|aynı|aynısı|o zaman|bu durumda|diğeri|ötekinde|ikisinde|bu soruda|dediğin)([\s,?.!]|$)/iu;

export function takipSorusuMu(soru: string): boolean {
  const q = (soru || "").trim();
  if (!q) return false;
  if (TAKIP_ISARETLERI.test(q)) return true;
  // Çok kısa ve içinde hiç "ağır" kelime (6+ harf) olmayan sorular da
  // neredeyse her zaman bir öncekine bağlıdır: "kaç kg?", "ya orada?"
  const kelimeler = q.split(/\s+/).filter(Boolean);
  if (kelimeler.length <= 3 && !kelimeler.some((w) => w.replace(/[^\p{L}]/gu, "").length >= 6)) {
    return true;
  }
  return false;
}

/** Aramada kullanılacak soru: takip sorusuysa bir önceki soruyla birleştirilir. */
export function aramaSorusu(soru: string, gecmis?: GecmisOge[]): string {
  if (!gecmis || gecmis.length === 0) return soru;
  if (!takipSorusuMu(soru)) return soru;
  const onceki = gecmis[gecmis.length - 1];
  return `${onceki.soru} ${soru}`.trim();
}

export interface RagSource {
  source_title: string;
  page: number;
  madde_no: string | null;
  madde_title: string | null;
}

export interface RagResult {
  answer: string;
  confidence: number;
  sources: RagSource[];
  needsHuman: boolean;
  /** Soru bu yarışmanın kapsamı dışında: cevap da verilmez, talep de açılmaz. */
  outOfScope: boolean;
  /** Cevap verilemediyse sebebi — kullanıcıya ne yapacağını söyleyebilmek için. */
  reason?: "alan_disi" | "yanlis_yarisma" | "kaynakta_yok";
}

// Neden cevap veremediğimizi ayrı ayrı söylüyoruz: "bulamadım" tek başına
// kullanıcıya ne yapması gerektiğini anlatmıyor.
const MSG_ALAN_DISI =
  "Bu asistan yalnızca TEKNOFEST yarışmalarının resmî şartname ve kılavuzlarındaki " +
  "sorulara cevap verir. Sorunuz bu kapsamın dışında görünüyor. Yarışma kuralları, " +
  "rapor şablonları, teslim tarihleri veya başvuru koşullarıyla ilgili bir soru sorabilirsiniz.";

const MSG_YANLIS_YARISMA =
  "Sorunuz seçtiğiniz yarışmanın belgeleriyle ilgili görünmüyor. Başka bir yarışmayı " +
  "kastediyorsanız üstteki \"Yarışma seçimine dön\" bağlantısından doğru yarışmayı seçip " +
  "tekrar sorabilirsiniz.";

const MSG_KAYNAKTA_YOK =
  "Bu konu, yüklü olan şartname ve kılavuzlarda düzenlenmemiş görünüyor — yani cevabı " +
  "bulamadığımız için değil, belgelerde böyle bir hüküm olmadığı için kesin yanıt vermiyoruz. " +
  "Talebinizi uzmana iletebilirsiniz.";

// Kapsam dışı mesajında yarışmanın adını söyleyebilmek için küçük bir sözlük.
// (Tam liste arayüzde; burada sadece kaynağı yüklü olanlar yeterli.)
const YARISMA_ADLARI: Record<string, string> = {
  iha: "Uluslararası İnsansız Hava Aracı (İHA) Yarışması",
  savasan_iha: "Savaşan İHA Yarışması",
  blokzincir: "Blokzincir Yarışması",
  cip_tasarim: "Çip Tasarım Yarışması",
  biyoteknoloji: "Biyoteknoloji İnovasyon Yarışması",
  "5g_yz_yol": "5G & Yapay Zeka ile Akıllı Yol Güvenliği Yarışması",
  dikey_inisli_roket: "Dikey İnişli Roket Yarışması",
};

function formatSourceLabel(meta: VectorMetadata): string {
  const maddePart = meta.madde_no ? ` · Madde ${meta.madde_no}` : "";
  return `${meta.source_title}, sayfa ${meta.page}${maddePart}`;
}

export async function answerFromKnowledgeBase(
  env: Env,
  question: string,
  competitionId?: string,
  gecmis?: GecmisOge[]
): Promise<RagResult> {
  // --- 1. AŞAMA: kalıp filtresi (model çağrılmadan) ---------------------
  if (looksOffTopic(question)) {
    return {
      answer: MSG_ALAN_DISI,
      reason: "alan_disi",
      confidence: 0,
      sources: [],
      needsHuman: false,
      outOfScope: true,
    };
  }

  // 2) Soruyu embed et. Takip sorusuysa önceki soruyla birleştirilmiş hâli
  //    aranır — yoksa "peki döner kanatta?" hiçbir maddeye benzemez.
  const sorgu = aramaSorusu(question, gecmis);
  const embedRes = (await env.AI.run(EMBEDDING_MODEL, {
    text: [sorgu],
  })) as { data: number[][] };
  const queryVector = embedRes.data[0];

  // 2) Vectorize'da en yakın parçaları bul - MVP madde 6: sadece seçilen
  // yarışmanın kaynaklarında ara (competition_id metadata index'i gerekli:
  // `wrangler vectorize create-metadata-index iha-sss-index --property-name=competition_id --type=string`)
  const matches = await env.VECTORIZE_INDEX.query(queryVector, {
    topK: 5,
    returnMetadata: true,
    filter: competitionId ? { competition_id: competitionId } : undefined,
  });

  const topScore = matches.matches[0]?.score ?? 0;

  // --- 2. AŞAMA: anlamsal kapsam kontrolü -------------------------------
  // En yakın kaynak parçası bile bu kadar uzaksa soru bu belge kümesiyle
  // ilgili değildir. Uzmana göndermek yerine kapsam dışı olarak yanıtlanır.
  if (matches.matches.length === 0 || topScore < SCOPE_THRESHOLD) {
    return {
      answer: MSG_YANLIS_YARISMA,
      reason: "yanlis_yarisma",
      confidence: topScore,
      sources: [],
      needsHuman: false,
      outOfScope: true,
    };
  }

  // --- Çapraz yarışma kontrolü ------------------------------------------
  // Skor düşükse iki ihtimal var: (a) konu hiçbir belgede düzenlenmemiş,
  // (b) soru DOĞRU ama YANLIŞ yarışmada soruluyor. Eşik ayarıyla bunları
  // ayırmak mümkün değil; onun yerine aynı soruyu filtresiz sorup en iyi
  // eşleşmenin hangi yarışmaya ait olduğuna bakıyoruz.
  if (competitionId && topScore < CONFIDENCE_THRESHOLD) {
    try {
      const genel = await env.VECTORIZE_INDEX.query(queryVector, {
        topK: 5,
        returnMetadata: true,
      });
      const digerleri = genel.matches.filter((m) => {
        const cid = (m.metadata as unknown as VectorMetadata)?.competition_id;
        return cid && cid !== competitionId;
      });
      const enIyiDiger = digerleri[0];
      // Belirgin bir fark arıyoruz: kıl payı farklar gürültü olabilir.
      if (enIyiDiger && enIyiDiger.score >= topScore + 0.04) {
        const cid = (enIyiDiger.metadata as unknown as VectorMetadata).competition_id;
        const ad = YARISMA_ADLARI[cid] ?? cid;
        return {
          answer:
            `Bu soru seçtiğiniz yarışmanın belgelerinde geçmiyor; içerik olarak ` +
            `**${ad}** kapsamına giriyor gibi görünüyor. Üstteki "Yarışma seçimine dön" ` +
            `bağlantısından o yarışmayı seçip tekrar sorabilirsiniz.`,
          reason: "yanlis_yarisma",
          confidence: enIyiDiger.score,
          sources: [],
          needsHuman: false,
          outOfScope: true,
        };
      }
    } catch {
      /* filtresiz sorgu başarısızsa akışı bozma, normal davran */
    }
  }

  const needsHuman = topScore < CONFIDENCE_THRESHOLD;

  const contextBlocks = matches.matches.map((m, i) => {
    const meta = m.metadata as unknown as VectorMetadata;
    return `[Kaynak ${i + 1}: ${formatSourceLabel(meta)}]\n${meta.text}`;
  });

  const sources: RagSource[] = matches.matches.map((m) => {
    const meta = m.metadata as unknown as VectorMetadata;
    return {
      source_title: meta.source_title,
      page: meta.page,
      madde_no: meta.madde_no ?? null,
      madde_title: meta.madde_title ?? null,
    };
  });

  if (needsHuman) {
    return {
      answer: MSG_KAYNAKTA_YOK,
      reason: "kaynakta_yok",
      confidence: topScore,
      sources,
      needsHuman: true,
      outOfScope: false,
    };
  }

  // Konuşma geçmişi: modelin "peki", "bunun", "aynı durumda" gibi
  // ifadeleri çözebilmesi için son iki soru-cevap veriliyor. Cevaplar
  // kısaltılıyor; amaç bağlam vermek, tüm metni tekrar okutmak değil.
  const gecmisBlogu =
    gecmis && gecmis.length
      ? "ÖNCEKİ KONUŞMA (kullanıcının bu sorusu buna bağlı olabilir):\n" +
        gecmis
          .slice(-2)
          .map((g, i) => `S${i + 1}: ${g.soru}\nC${i + 1}: ${(g.cevap || "").slice(0, 400)}`)
          .join("\n") +
        "\n\nKullanıcının yeni sorusu önceki konuya atıf yapıyorsa (peki, bunun, aynı, o zaman...), " +
        "atfı yukarıdaki konuşmadan çöz ve tam soruyu cevapla. Atıf yoksa geçmişi yok say.\n\n"
      : "";

  // 3) LLM ile SADECE verilen kaynaklara dayanarak cevap üret
  const prompt = `Sen TEKNOFEST yarışmaları için resmi şartname ve kılavuzlara dayanarak
cevap veren bir asistansın. SADECE aşağıda verilen kaynak metinleri kullanarak cevap ver.
Kaynaklarda olmayan hiçbir bilgiyi uydurma. Eğer kaynaklarda net bir cevap yoksa,
"Bu konuda şartnamede net bir bilgi bulamadım, bir uzmana danışmanızı öneririm" de.
Cevabının sonunda, kullandığın kaynağın madde numarasını "(Madde X.Y)" formatında,
madde numarası yoksa sadece belge adı ve sayfa numarasını belirt.

ÇOK ÖNEMLİ — KATEGORİ VE SEVİYE AYRIMI:
İHA yarışmalarında kurallar hem KATEGORİYE (Sabit Kanat / Döner Kanat / Serbest Görev)
hem de SEVİYEYE (Liseler Arası / Uluslararası) göre değişebilir.
Kullanıcı kategoriyi veya seviyeyi belirtmediyse, kaynaklarda ayrım varsa HEPSİNİ ayrı ayrı
yaz. Örneğin: "Sabit Kanat: ... / Döner Kanat: ... / Serbest Görev: ..." veya
"Liseler Arası: ... / Uluslararası: ...". Tek bir kategoriyi seçip diğerlerini atlama.
Kaynaklarda böyle bir ayrım yoksa AYRIM UYDURMA; bunun yerine cevabın başında
hangi belgeye/seviyeye dayandığını açıkça yaz (örneğin: "Uluslararası İHA
şartnamesine göre:"), çünkü yüklü olmayan bir seviyenin kuralı farklı olabilir.

${gecmisBlogu}KAYNAKLAR:
${contextBlocks.join("\n\n---\n\n")}

SORU: ${question}

CEVAP (Türkçe, kısa ve net):`;

  const llmRes = (await env.AI.run(LLM_MODEL, {
    messages: [{ role: "user", content: prompt }],
    max_tokens: 512,
  })) as { response: string };

  return {
    answer: llmRes.response,
    confidence: topScore,
    sources,
    needsHuman: false,
    outOfScope: false,
  };
}

// ---------------------------------------------------------------------------
// SSS havuzundan gelen cevaplar için "ilgili şartname bölümü".
// Bu kaynaklar cevabın birebir dayanağı DEĞİL — insan yazmış olabilir — ama
// kullanıcının konuyu şartnamede görmesini sağlıyor. Bu yüzden arayüzde ayrı
// bir dille ("ilgili bölüm") gösteriliyor; "kaynak" demek yanıltıcı olurdu.
// ---------------------------------------------------------------------------
export async function ilgiliKaynaklar(
  env: Env,
  question: string,
  competitionId?: string
): Promise<RagSource[]> {
  try {
    const embedRes = (await env.AI.run(EMBEDDING_MODEL, { text: [question] })) as { data: number[][] };
    const matches = await env.VECTORIZE_INDEX.query(embedRes.data[0], {
      topK: 2,
      returnMetadata: true,
      filter: competitionId ? { competition_id: competitionId } : undefined,
    });
    // Zayıf eşleşmeyi göstermiyoruz: alakasız bir sayfaya yönlendirmektense
    // hiç rozet olmaması daha dürüst.
    return matches.matches
      .filter((m) => m.score >= CONFIDENCE_THRESHOLD)
      .map((m) => {
        const meta = m.metadata as unknown as VectorMetadata;
        return {
          source_title: meta.source_title,
          page: meta.page,
          madde_no: meta.madde_no ?? null,
          madde_title: meta.madde_title ?? null,
        };
      });
  } catch {
    return [];
  }
}
