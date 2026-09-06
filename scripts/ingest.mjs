// knowledge/chunks.json içindeki metin parçalarını Cloudflare Workers AI ile
// embedding'e çevirir ve Vectorize'a insert edilecek ndjson dosyasını üretir.
//
// Kullanım:
//   CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx node scripts/ingest.mjs
//   sonra: npm run vectorize:insert
//
// CF_API_TOKEN: "Workers AI" için "Edit" iznine sahip bir API token (Cloudflare
// dashboard -> My Profile -> API Tokens -> Create Token).

import fs from "node:fs";
import path from "node:path";

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const API_TOKEN = process.env.CF_API_TOKEN;
const MODEL = "@cf/baai/bge-m3"; // çok dilli embedding modeli, Türkçe destekler
const BATCH_SIZE = 20;

if (!ACCOUNT_ID || !API_TOKEN) {
  console.error(
    "HATA: CF_ACCOUNT_ID ve CF_API_TOKEN ortam değişkenlerini ayarlaman gerekiyor.\n" +
    "Örnek: CF_ACCOUNT_ID=xxx CF_API_TOKEN=xxx node scripts/ingest.mjs"
  );
  process.exit(1);
}

// Girdi/çıktı dosyaları CLI ile değiştirilebilir:
//   node scripts/ingest.mjs chunks_new.json vectors_new.ndjson
// Böylece yeni yarışmaların vektörleri, İHA'nın hazır vectors.ndjson dosyasının
// üzerine yazılmadan üretilebilir.
const chunksPath = path.join(process.cwd(), "knowledge", process.argv[2] || "chunks.json");
const outPath = path.join(process.cwd(), "knowledge", process.argv[3] || "vectors.ndjson");

const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf-8"));
console.log(`${chunks.length} chunk okundu, embedding üretiliyor (model: ${MODEL})...`);

async function embedBatch(texts) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${MODEL}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: texts }),
    }
  );
  const json = await res.json();
  if (!json.success) {
    throw new Error(`Embedding API hatası: ${JSON.stringify(json.errors)}`);
  }
  // API çıktısı: { result: { data: [[...vector...], ...] } }
  return json.result.data;
}

async function main() {
  const outStream = fs.createWriteStream(outPath, { flags: "w" });
  let done = 0;

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedBatch(batch.map((c) => c.text));

    batch.forEach((chunk, idx) => {
      const record = {
        id: chunk.id,
        values: vectors[idx],
        metadata: {
          source_file: chunk.source_file,
          source_title: chunk.source_title,
          doc_type: chunk.doc_type,
          competition_id: chunk.competition_id ?? "iha",
          page: chunk.page,
          madde_no: chunk.madde_no ?? null,
          madde_title: chunk.madde_title ?? null,
          text: chunk.text.slice(0, 800), // Vectorize metadata boyut sınırı için kırp
        },
      };
      outStream.write(JSON.stringify(record) + "\n");
    });

    done += batch.length;
    console.log(`  ${done}/${chunks.length} embedding tamamlandı`);
  }

  outStream.end();
  console.log(`\nBitti. Çıktı: ${outPath}`);
  console.log("Şimdi çalıştır: npm run vectorize:insert");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
