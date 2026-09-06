// chunk.py'deki madde/başlık tespit mantığının TS portu.
// unpdf ile çıkarılan sayfa metinlerini (string[]) alır, madde numarası/başlığı
// etiketlenmiş chunk'lar üretir.

export interface RawChunk {
  text: string;
  page: number;
  madde_no: string | null;
  madde_title: string | null;
}

// Örn: "2.3. Başvuru Koşulları" -> no="2.3", title="Başvuru Koşulları"
const HEADING_RE = /^\s{0,6}(\d{1,2}(?:\.\d{1,2}){0,3})\.\s+([A-ZÇĞİÖŞÜ][^\n]{2,80})\s*$/;

const MIN_CHUNK_CHARS = 40;
const MAX_CHUNK_CHARS = 1800;

export function chunkPages(pageTexts: string[]): RawChunk[] {
  const chunks: RawChunk[] = [];

  let currentMaddeNo: string | null = null;
  let currentMaddeTitle: string | null = null;
  let buffer: string[] = [];
  let bufferPage = 1;

  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text.length >= MIN_CHUNK_CHARS) {
      // çok uzun parçaları paragraf sınırlarında böl
      if (text.length <= MAX_CHUNK_CHARS) {
        chunks.push({ text, page: bufferPage, madde_no: currentMaddeNo, madde_title: currentMaddeTitle });
      } else {
        let start = 0;
        while (start < text.length) {
          const slice = text.slice(start, start + MAX_CHUNK_CHARS);
          chunks.push({ text: slice, page: bufferPage, madde_no: currentMaddeNo, madde_title: currentMaddeTitle });
          start += MAX_CHUNK_CHARS;
        }
      }
    }
    buffer = [];
  };

  pageTexts.forEach((pageText, idx) => {
    const pageNum = idx + 1;
    const paragraphs = pageText.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

    for (const para of paragraphs) {
      const lines = para.split("\n");
      let isHeading = false;
      for (const line of lines) {
        const m = HEADING_RE.exec(line.trim());
        if (m) {
          flush();
          currentMaddeNo = m[1];
          currentMaddeTitle = m[2].trim();
          bufferPage = pageNum;
          isHeading = true;
        }
      }
      if (isHeading) continue;
      if (buffer.length === 0) bufferPage = pageNum;
      buffer.push(para);
    }
  });

  flush();
  return chunks;
}
