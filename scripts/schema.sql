-- MVP veri modeli: 4 kullanıcı rolü (yarisci, hakem, koordinator, admin)
-- ve tek bir "talep" (soru veya itiraz) tablosu.

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS ticket_events;
DROP TABLE IF EXISTS faqs;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('yarisci', 'hakem', 'koordinator', 'admin')),
  team_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- type: 'soru' (chatbot'a sorulan ve AI'nin emin olamadığı sorular)
--       'itiraz' (elenme/karar kararına itiraz)
-- status: 'ai_cevapladi' | 'insana_yonlendirildi' | 'atandi' | 'cevaplandi' | 'kapatildi'
CREATE TABLE tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  type TEXT NOT NULL CHECK (type IN ('soru', 'itiraz')),
  category TEXT, -- ör: 'video_kirma', 'psr', 'sartname', 'diger'
  question TEXT NOT NULL,
  ai_answer TEXT,
  ai_confidence REAL,
  ai_sources TEXT, -- JSON: [{source_title, page}]
  decision_reason TEXT, -- itirazlarda: elenme/karar gerekçesi (varsa)
  team_id TEXT, -- itirazlarda: takım ID
  application_id TEXT, -- itirazlarda: başvuru ID
  helpful INTEGER, -- AI cevabı için 👍/👎: NULL yok, 1 evet, 0 hayır
  status TEXT NOT NULL DEFAULT 'ai_cevapladi',
  assigned_to INTEGER REFERENCES users(id),
  human_answer TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ticket_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id),
  actor_id INTEGER REFERENCES users(id),
  event_type TEXT NOT NULL, -- 'olusturuldu' | 'atandi' | 'cevaplandi' | 'kapatildi'
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Yarışmaya özel, destek ekibi tarafından büyütülen SSS havuzu
CREATE TABLE faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  source_ticket_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO faqs (competition_id, question, answer) VALUES
  ('iha', 'Sabit kanat görev videosunda hangi çekim açıları zorunlu?',
   'Sabit Kanat görev videosunda "hava aracı uçuş videosu", "pilotun eş zamanlı görüntüsü" ve "yer istasyonu" olmak üzere üç parçaya bölünmesi zorunludur.'),
  ('iha', 'Başvuru için hangi belgeler gerekiyor?',
   'Şartnamenin "Başvuru Koşulları ve Yöntemi" bölümünde (Madde 4) detaylandırılmıştır; PSR ve görev videosu bu sürecin parçasıdır.');

-- Demo veri (opsiyonel, elle silinebilir)
INSERT INTO users (name, email, role, team_name) VALUES
  ('Demo Yarışmacı', 'yarisci@demo.t3', 'yarisci', 'Takım Şahin'),
  ('Demo Hakem', 'hakem@demo.t3', 'hakem', NULL),
  ('Demo Koordinatör', 'koordinator@demo.t3', 'koordinator', NULL),
  ('Demo Admin', 'admin@demo.t3', 'admin', NULL);
