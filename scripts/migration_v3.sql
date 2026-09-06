-- v3: AI cevaplarına 👍/👎 geri bildirimi eklendi
ALTER TABLE tickets ADD COLUMN helpful INTEGER; -- NULL = geri bildirim yok, 1 = yardımcı oldu, 0 = olmadı
