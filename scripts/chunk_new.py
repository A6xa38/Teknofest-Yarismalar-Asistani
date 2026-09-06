#!/usr/bin/env python3
"""Yeni yarışmaların şartname PDF'lerini chunk'lara böler ve
knowledge/chunks_new.json dosyasını üretir.

Mantık src/worker/chunker.ts ile aynıdır (madde numarası/başlığı tespiti +
1800 karakter üst sınırı), böylece İHA için üretilmiş chunk'larla tutarlı olur.
"""
import hashlib
import json
import re
import sys

import pdfplumber

HEADING_RE = re.compile(r"^\s{0,6}(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-ZÇĞİÖŞÜ][^\n]{2,80})\s*$")
MIN_CHUNK_CHARS = 40
MAX_CHUNK_CHARS = 1800

UPLOAD_DIR = "/mnt/user-data/uploads/Yapay Zeka Creathon"

DOCS = [
    {
        "file": f"{UPLOAD_DIR}/2026_5G_YAPAY_ZEKA_İLE_AKILLI_YOL_GÜVENLİĞİ_YARISMASI_SARTNAMESI_2_PORZ6.pdf",
        "competition_id": "5g_yz_yol",
        "source_title": "5G & Yapay Zeka ile Akıllı Yol Güvenliği Şartnamesi 2026",
        "doc_type": "sartname",
    },
    {
        "file": f"{UPLOAD_DIR}/5G_ve_Yapay_Zeka_ile_Akıllı_Yol_Güvenliği_Yarışması_-_FTR_Aşaması_Teslim_D.pdf",
        "competition_id": "5g_yz_yol",
        "source_title": "5G & Yapay Zeka FTR Aşaması Teslim Dokümanı",
        "doc_type": "kilavuz",
    },
    {
        "file": f"{UPLOAD_DIR}/2026-TR_Biyoteknoloji_İnovasyon_Yarışması_Şartname-_1I5Kr.pdf",
        "competition_id": "biyoteknoloji",
        "source_title": "Biyoteknoloji İnovasyon Yarışması Şartnamesi 2026",
        "doc_type": "sartname",
    },
    {
        "file": f"{UPLOAD_DIR}/2026_BLOKZİNCİR_YARIŞMASI_ŞARTNAMESİ_TR.20_02_rBh8h.pdf",
        "competition_id": "blokzincir",
        "source_title": "Blokzincir Yarışması Şartnamesi 2026",
        "doc_type": "sartname",
    },
    {
        "file": f"{UPLOAD_DIR}/2026_Çip_Tasarım_Yarışması_Şartnamesi_v1_3_draft_1_LK3oV.pdf",
        "competition_id": "cip_tasarim",
        "source_title": "Çip Tasarım Yarışması Şartnamesi 2026",
        "doc_type": "sartname",
    },
]


TARGET_CHUNK_CHARS = 900   # RAG için ideal parça boyutu (İHA chunk'larıyla benzer yoğunluk)


def chunk_pages(page_texts):
    """Satır bazlı ilerler; her satırda madde başlığı arar ve mevcut maddeyi
    etiket olarak taşır. Parça hedef boyuta ulaşınca (veya madde değişince)
    kapatılır. Sayfa geçişinde parça kapanmaz ama sayfa no ilk satırdan alınır —
    böylece kaynak gösteriminde doğru sayfa görünür."""
    chunks = []
    cur_no = None
    cur_title = None
    buffer = []
    buffer_len = 0
    buffer_page = 1

    def flush():
        nonlocal buffer, buffer_len
        text = "\n".join(buffer).strip()
        if len(text) >= MIN_CHUNK_CHARS:
            for start in range(0, max(len(text), 1), MAX_CHUNK_CHARS):
                piece = text[start:start + MAX_CHUNK_CHARS]
                if len(piece) >= MIN_CHUNK_CHARS or not chunks:
                    chunks.append((piece, buffer_page, cur_no, cur_title))
        buffer = []
        buffer_len = 0

    for idx, page_text in enumerate(page_texts):
        page_num = idx + 1
        for raw_line in (page_text or "").split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            m = HEADING_RE.match(line)
            if m:
                # yeni madde başlığı: önceki parçayı kapat, başlığı da parçanın
                # içine yaz (soru genelde başlıktaki kelimeleri içerir)
                flush()
                cur_no = m.group(1)
                cur_title = m.group(2).strip()
                buffer_page = page_num
                buffer.append(f"{cur_no}. {cur_title}")
                buffer_len = len(cur_title)
                continue
            if not buffer:
                buffer_page = page_num
            buffer.append(line)
            buffer_len += len(line) + 1
            if buffer_len >= TARGET_CHUNK_CHARS:
                flush()

    flush()
    return chunks


def main():
    out = []
    for doc in DOCS:
        try:
            with pdfplumber.open(doc["file"]) as pdf:
                pages = [p.extract_text() or "" for p in pdf.pages]
        except Exception as exc:  # noqa: BLE001
            print(f"ATLANDI {doc['source_title']}: {exc}", file=sys.stderr)
            continue

        raw = chunk_pages(pages)
        for text, page, madde_no, madde_title in raw:
            # id, İHA chunk'larıyla çakışmasın diye competition_id + metin hash'i
            cid = hashlib.sha1(
                (doc["competition_id"] + "|" + doc["source_title"] + "|" + str(page) + "|" + text[:200]).encode("utf-8")
            ).hexdigest()[:12]
            out.append({
                "id": cid,
                "source_file": doc["file"].rsplit("/", 1)[-1].rsplit(".", 1)[0][:80],
                "source_title": doc["source_title"],
                "doc_type": doc["doc_type"],
                "competition_id": doc["competition_id"],
                "page": page,
                "madde_no": madde_no,
                "madde_title": madde_title,
                "text": text,
            })
        print(f"{doc['source_title']}: {len(pages)} sayfa -> {len(raw)} chunk")

    # İçindekiler (TOC) sayfaları RAG için gürültü: "....." dolgu noktaları
    # cevapta madde metni yerine başlık listesi döndürüyor. Bunları at.
    def is_toc(text):
        dots = text.count(".....")
        return dots >= 3 or (text.count(".") / max(len(text), 1)) > 0.18

    # id çakışmalarını temizle
    seen = set()
    deduped = []
    dropped = 0
    for c in out:
        if c["id"] in seen:
            continue
        if is_toc(c["text"]):
            dropped += 1
            continue
        seen.add(c["id"])
        deduped.append(c)
    print(f"İçindekiler/gürültü olarak atılan chunk: {dropped}")

    with open("knowledge/chunks_new.json", "w", encoding="utf-8") as fh:
        json.dump(deduped, fh, ensure_ascii=False, indent=1)
    print(f"\nTOPLAM {len(deduped)} chunk -> knowledge/chunks_new.json")


if __name__ == "__main__":
    main()
