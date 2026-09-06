-- v4: yarışmaya özel, destek ekibi tarafından büyütülen SSS havuzu
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_ticket_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- İHA için başlangıç tohum verisi (ileride destek ekibi kendi ekleyecek)
INSERT INTO faqs (competition_id, question, answer) VALUES
  ('iha', 'Sabit kanat görev videosunda hangi çekim açıları zorunlu?',
   'Sabit Kanat görev videosunda "hava aracı uçuş videosu", "pilotun eş zamanlı görüntüsü" ve "yer istasyonu" olmak üzere üç parçaya bölünmesi zorunludur.'),
  ('iha', 'Başvuru için hangi belgeler gerekiyor?',
   'Şartnamenin "Başvuru Koşulları ve Yöntemi" bölümünde (Madde 4) detaylandırılmıştır; PSR ve görev videosu bu sürecin parçasıdır.');
