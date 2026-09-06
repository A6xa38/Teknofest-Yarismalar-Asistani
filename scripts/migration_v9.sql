-- v9: Hakemler yarışmalara atanır. Bir hakem yalnızca kendi yarışmalarının
-- taleplerini görür ve cevaplayabilir. NULL/boş = tüm yarışmalar (koordinatör, admin).
-- Birden fazla yarışma virgülle yazılır: 'iha,blokzincir'
ALTER TABLE users ADD COLUMN competitions TEXT;

UPDATE users SET competitions = 'iha'                    WHERE email = 'hakem@demo.t3';
UPDATE users SET competitions = 'blokzincir,cip_tasarim' WHERE email = 'koordinator@demo.t3';
UPDATE users SET competitions = NULL                     WHERE email IN ('admin@demo.t3','icerik@demo.t3');
