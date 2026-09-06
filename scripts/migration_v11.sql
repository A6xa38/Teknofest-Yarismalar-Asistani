-- v11: yarışma bazlı iki hakem hesabı + yarışmacı girişi
-- Şifre karması = SHA-256("<salt>:<şifre>") — auth.ts'teki hashPassword ile aynı.

INSERT INTO users (name, email, role, password_salt, password_hash, competitions)
VALUES ('İHA Hakemi', 'iha.hakem@demo.t3', 'hakem', 'salt-iha',
        'ab001381e7693d165c390d89497fb16f207d68cbe2b6721e180de20b41ea73f9', 'iha')
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name, role = excluded.role,
  password_salt = excluded.password_salt, password_hash = excluded.password_hash,
  competitions = excluded.competitions;

INSERT INTO users (name, email, role, password_salt, password_hash, competitions)
VALUES ('Blokzincir Hakemi', 'blok.hakem@demo.t3', 'hakem', 'salt-blok',
        'a509b3046c3d6ccbc60cee2364a0df6cf13d89e04fddc4bffc5e0503b6cbcf8f', 'blokzincir')
ON CONFLICT(email) DO UPDATE SET
  name = excluded.name, role = excluded.role,
  password_salt = excluded.password_salt, password_hash = excluded.password_hash,
  competitions = excluded.competitions;

-- Yarışmacı hesabı zaten vardı ama şifresi yoktu; giriş yapabilsin diye ekliyoruz.
INSERT INTO users (name, email, role, password_salt, password_hash, competitions)
VALUES ('Demo Yarışmacı', 'yarisci@demo.t3', 'yarisci', 'salt-yarisci',
        '23c4d6cf46d2a0f181c61e25f5a430447bf1f17360695a23e9c797096c0823d2', NULL)
ON CONFLICT(email) DO UPDATE SET
  role = excluded.role,
  password_salt = excluded.password_salt, password_hash = excluded.password_hash;
