-- v10: (1) kaynak PDF'lerine tıklanabilir erişim, (2) yarışma bazlı soru analizi

-- Ham şartname/kılavuz dosyaları. documents tablosundan ayrı tutuluyor çünkü
-- burada amaç parçalama/indeksleme değil, sadece "kaynağa tıklayınca PDF açılsın".
CREATE TABLE IF NOT EXISTS source_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id TEXT NOT NULL,
  source_title   TEXT NOT NULL,
  filename       TEXT,
  r2_key         TEXT NOT NULL,
  uploaded_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_source_files_title ON source_files(source_title);

-- Sorulan HER soru buraya düşer (cevaplansın ya da cevaplanmasın). Talep
-- tablosu yalnızca uzmana iletilenleri tuttuğu için "en çok ne merak ediliyor"
-- sorusunu oradan cevaplayamıyorduk.
CREATE TABLE IF NOT EXISTS question_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id TEXT,
  question   TEXT NOT NULL,
  outcome    TEXT,
  confidence REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qlog_comp ON question_log(competition_id, created_at);
