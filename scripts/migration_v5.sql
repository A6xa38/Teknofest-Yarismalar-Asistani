-- v5: kimlik doğrulama (id + şifre) için users tablosunu genişletme,
-- İçerik Yöneticisi rolü ekleme, belge yönetimi (documents/document_chunks) tabloları.

-- tickets tablosu users(id)'e FK ile bağlı olduğu için, users tablosunu
-- (CHECK constraint'i genişletmek üzere) DROP+RENAME ile yeniden oluştururken
-- SQLite bunu foreign key ihlali sayıp hata verir. defer_foreign_keys, FK
-- kontrolünü transaction'ın sonuna erteler (id'ler aynı kalacağı için sorun
-- kalmayacak).
PRAGMA defer_foreign_keys = TRUE;

-- Önce, users(id)'e referans veren ama artık karşılığı olmayan (orphan)
-- satırları temizle - yoksa transaction sonunda FK kontrolü yine patlar.
UPDATE tickets SET user_id = NULL WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM users);
UPDATE tickets SET assigned_to = NULL WHERE assigned_to IS NOT NULL AND assigned_to NOT IN (SELECT id FROM users);
UPDATE ticket_events SET actor_id = NULL WHERE actor_id IS NOT NULL AND actor_id NOT IN (SELECT id FROM users);

-- SQLite'ta CHECK constraint'i doğrudan ALTER edilemediği için users tablosunu
-- yeniden oluşturup mevcut satırları taşıyoruz.
CREATE TABLE users_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('yarisci', 'hakem', 'koordinator', 'admin', 'icerik_yoneticisi')),
  team_name TEXT,
  password_hash TEXT,
  password_salt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO users_new (id, name, email, role, team_name, created_at)
  SELECT id, name, email, role, team_name, created_at FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Demo şifreleri: sha256(salt + ":" + şifre) hex. Worker Web Crypto ile aynı formülü kullanır.
UPDATE users SET password_hash = '9e480dc6ff686004ceb71ff763acae198158b6c5bac63433afa9019029327c10', password_salt = 'salt-hakem'
  WHERE email = 'hakem@demo.t3';
UPDATE users SET password_hash = 'ddd9a75e2ab6e8d5be56d274cde407ec9d69c457ad0e4ded82d7899ed847889f', password_salt = 'salt-koordinator'
  WHERE email = 'koordinator@demo.t3';
UPDATE users SET password_hash = '5e6cce97da51f50e0c633f07fdf4c7e77a14a9379f17f42afdcc21a0aed27795', password_salt = 'salt-admin'
  WHERE email = 'admin@demo.t3';

INSERT INTO users (name, email, role, password_hash, password_salt) VALUES
  ('Demo İçerik Yöneticisi', 'icerik@demo.t3', 'icerik_yoneticisi',
   '65eef7f0146957d3b0d2f3b22aa7f708767187a4277e4271ab275532686b3b90', 'salt-icerik');

-- Belge yönetimi: yüklenen şartname/kılavuz/SSS kaynakları + geçerlilik durumu (AKIŞ 02)
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id TEXT NOT NULL,
  title TEXT NOT NULL,
  filename TEXT NOT NULL,
  version TEXT,
  status TEXT NOT NULL DEFAULT 'isleniyor' CHECK (status IN ('isleniyor', 'aktif', 'pasif', 'hata')),
  chunk_count INTEGER NOT NULL DEFAULT 0,
  total_chunks INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  r2_key TEXT
);

-- Belgeden çıkarılan, henüz embed edilmemiş/edilmiş parçalar (batch işleme için)
CREATE TABLE IF NOT EXISTS document_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id),
  vector_id TEXT NOT NULL,
  page INTEGER,
  madde_no TEXT,
  madde_title TEXT,
  text TEXT NOT NULL,
  embedded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
