# Yarışmalar Asistanı

TEKNOFEST yarışmacılarının şartname sorularını **yalnızca resmî belgelerden**, cevabın hangi maddeden geldiğini göstererek yanıtlayan; emin olamadığında uydurmayıp **ilgili hakeme yönlendiren** RAG tabanlı asistan.

**Canlı demo:** https://yarismalar-asistani.farukakpinar301.workers.dev

T3 Vakfı Bursiyer Yapay Zekâ Creathonu 2026 — **Problem 5**: TEKNOFEST Yapay Zekâ Destekli SSS ve Chatbot Asistanı
Takım: **Gazi Uzay** · Başvuru ID: **5393467**

---

## Neden

2026 sezonunda Sabit Kanat kategorisinden elendik. Elenme gerekçesi görev videosuyla ilgili, şartnamede açıkça yazmayan bir kuraldı — ve o soruyu soracak tanımlı bir yer yoktu. Bu proje tam olarak o boşluğu kapatmak için yazıldı.

## Ne yapar

- Yarışmacı sorusunu serbest ifadeyle sorar; sistem anlamsal arama ile ilgili şartname maddelerini bulur.
- Cevabın altında **belge adı + sayfa + madde numarası** görünür; rozete tıklanınca şartname PDF'i **o sayfada** açılır.
- Kaynakta karşılığı yoksa cevap uydurulmaz; yarışmacı isterse talep açar ve talep **yalnızca o yarışmadan sorumlu hakemin** paneline düşer.
- Hakem cevabı SSS havuzuna eklenince aynı soru bir daha dil modeline hiç gitmeden, "ekip onaylı" olarak yanıtlanır.
- Sorulan her soru kaydedilir; yönetim panelinde **en çok merak edilenler** ve **şartnamede karşılığı olmayan tekrarlayan sorular** raporlanır.

## Mimari

```
Tarayıcı (React 18, derleme adımı yok)
        │  /api/*
        ▼
Cloudflare Worker  ── Hono (TypeScript)
        ├── D1 (SQLite)     kullanıcılar, talepler, SSS, belgeler, soru günlüğü
        ├── Vectorize       533 şartname parçası · 1024 boyut · cosine
        ├── Workers AI      bge-m3 (gömme) + Llama 3.3 70B (cevap)
        ├── R2              panelden yüklenen ham PDF'ler
        └── Static Assets   arayüz + public/kaynak/ altındaki şartname PDF'leri
```

### Bir soru sorulduğunda

| # | Aşama | Ne yapar |
|---|---|---|
| 1 | Kalıp filtresi | "şiir yaz", "kod yaz", "önceki talimatlarını unut" — model çağrılmadan elenir |
| 2 | SSS ön eşleşmesi | Gövde + trigram benzerliği ≥ 0.62 ise ekip onaylı cevap anında döner |
| 3 | Takip sorusu çözümü | "peki döner kanatta?" önceki soruyla birleştirilerek aranır |
| 4 | Anlamsal arama | Soru gömülür, `competition_id` filtresiyle en yakın 5 parça çekilir |
| 5 | Kapsam kontrolü | Skor < 0.28 → kapsam dışı; başka yarışmada belirgin daha iyi eşleşme → yanlış yarışma |
| 6 | Cevap üretimi | Skor ≥ 0.45 ise model **yalnızca** çekilen parçalarla cevap yazar, madde/sayfa gösterir |
| 7 | İnsana devir | Skor < 0.45 → cevap üretilmez; kullanıcı isterse talep açar |

Eşikler `src/worker/rag.ts` içindedir: `CONFIDENCE_THRESHOLD = 0.45`, `SCOPE_THRESHOLD = 0.28`.

Türkçe'ye özel iki çözüm: JavaScript'in `\b` kelime sınırı Türkçe karakterleri tanımadığı için kapsam filtresine Unicode farkındalıklı kendi sınırımız yazıldı; sondan eklemeli yapı yüzünden SSS eşleştirmesinde kaba gövdeleme + karakter üçlüsü (trigram) benzerliği birlikte kullanıldı.

### Roller

| Rol | Yetki |
|---|---|
| Yarışmacı | Soru sorma, kaynağa erişme, "Sorularım" ile kendi taleplerini izleme |
| Hakem | **Yalnızca kendi yarışmasının** taleplerini görme ve cevaplama |
| Koordinatör | Birden çok yarışma, talep atama |
| İçerik yöneticisi | Şartname yükleme ve sürüm yönetimi, yarışma analizi |
| Sistem yöneticisi | Yanıt kalitesi istatistikleri, tüm yarışmalar |

Yetki kapsamı, girişte üretilen **HMAC-SHA256 imzalı** oturum anahtarının içinde taşınır ve **her istekte sunucu tarafında** doğrulanır — arayüzde gizlemekle yetinilmez.

## Dizin yapısı

```
src/worker/
  index.ts      API uç noktaları, yetkilendirme, SSS eşleşmesi, analiz
  rag.ts        kapsam filtresi, anlamsal arama, cevap üretimi, takip sorusu
  auth.ts       şifre karması, token imzalama/doğrulama, requireAuth
  chunker.ts    PDF metnini madde etiketli parçalara bölme
  types.ts      ortak tipler
public/
  index.html    tek sayfa iskeleti + importmap
  app.js        tüm arayüz (React, tek dosya)
  kaynak/       şartname PDF'leri (telif nedeniyle depoda yok — bkz. BENIOKU.md)
scripts/
  schema.sql          ilk şema
  migration_v2..v13   sürüm sürüm şema değişiklikleri
  chunk.py            çevrimdışı parçalama
  ingest.mjs          parçaları gömüp Vectorize'a yazma
knowledge/
  chunks.json         İHA belgelerinin parçaları
  chunks_new.json     diğer yarışmaların parçaları
```

## Kurulum

Gereken: Node.js 18+ ve bir Cloudflare hesabı.

```bash
npm install
npx wrangler login

# Kaynaklar
npm run vectorize:create
npm run vectorize:create-metadata-index
npm run r2:create

# Veritabanı
npx wrangler d1 create iha-sss-db      # çıkan database_id'yi wrangler.toml'a yaz
npm run db:migrate:remote
npm run db:migrate-v2:remote           # ... v13'e kadar sırayla

# Oturum imza anahtarı (zorunlu)
npx wrangler secret put AUTH_SECRET

# Bilgi tabanını yükle
npm run ingest
npm run vectorize:insert

npm run deploy
```

`/api/health` adresi kurulumun durumunu (tablolar, secret, rol yetkileri) tek bakışta gösterir.

## Demo hesapları

Bu **değerlendirme amaçlı bir demo dağıtımıdır**; aşağıdaki hesaplar bilerek herkese açıktır.

| E-posta | Şifre | Rol |
|---|---|---|
| `yarisci@demo.t3` | `yarisci123` | Yarışmacı |
| `iha.hakem@demo.t3` | `iha123` | Hakem — İHA |
| `blok.hakem@demo.t3` | `blok123` | Hakem — Blokzincir |
| `koordinator@demo.t3` | `koordinator123` | Koordinatör |
| `icerik@demo.t3` | `icerik123` | İçerik yöneticisi |
| `admin@demo.t3` | `admin123` | Sistem yöneticisi |

Gerçek bir kurulumda bu hesaplar silinmeli, kullanıcılar kurumun kendi kimlik sistemi üzerinden tanımlanmalıdır.

## Güvenlik notları

- `AUTH_SECRET` ve `SETUP_KEY` kodda **değildir**, Cloudflare secret olarak tutulur.
- `SETUP_KEY` tanımlı değilse veritabanını yeniden kurabilen `/api/setup` uç noktası tamamen kapalıdır.
- Şifreler veritabanında salt'lı SHA-256 karması olarak saklanır.
- Yetkilendirme sunucu tarafındadır; yetki alanı dışındaki bir talebe erişim 403 döner.

## Bilinen sınırlar

Dürüst olmak, sonradan yakalanmaktan iyidir:

- **Doğruluk ölçüm setimiz yok.** Sayısal bir doğruluk iddiasında bulunmuyoruz. Sıradaki iş: yarışma başına hakem onaylı 50–100 soruluk referans set.
- **Tablo ve şekiller okunmuyor** — PDF'ten yalnızca düz metin çıkarılıyor.
- **Kapsayıcı sorular zayıf** — en yakın 5 parça çekildiği için "şartnamedeki tüm tarihleri listele" gibi sorular eksik cevaplanabilir.
- **Yalnızca Türkçe.**
- **İstek sınırlama (rate limit) yok** — üretim kullanımında eklenmelidir.
- **İzleme, uyarı ve otomatik yedekleme yapılandırılmadı.**
- **Kurumsal kimlik entegrasyonu (KYS / SSO) yok** — kurumsal anlaşma gerektirir.

## Yapay zekâ kullanımı

Ürün kararları — hangi ekranların olacağı, akışın nasıl işleyeceği, hangi panellerin bulunacağı, arayüz tasarımı — takıma aittir. Kodun yazımında yapay zekâ (Claude) yoğun biçimde kullanılmıştır; gömme modeli seçimi, parçalama stratejisi ve veritabanı şeması gibi bazı mühendislik tercihleri yapay zekânın önerisiyle, takımın onayıyla belirlenmiştir.

## Ekip

| | |
|---|---|
| Ömer Faruk Akpınar | Problem & çözüm, ürün ve arayüz tasarımı, iş modeli |
| Ahmet Kadim Koç | Pazarlama ve rekabet analizi |
| Semihcan Işık | Sistem mimarisi |

## Lisans

MIT — `LICENSE` dosyasına bakınız.

TEKNOFEST şartname ve kılavuz **PDF'leri telif nedeniyle bu depoya dahil edilmemiştir**; nereye konacakları `public/kaynak/BENIOKU.md` içinde anlatılmıştır. `knowledge/` altındaki metin parçaları yalnızca sistemin nasıl çalıştığını gösterebilmek için bulunur; bu belgelerin hakları T3 Vakfı / TEKNOFEST'e aittir.
