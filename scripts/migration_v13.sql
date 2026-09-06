-- v13: tickets.helpful kolonu uzak veritabanında eksikti (migration_v3 hiç
-- --remote çalıştırılmamış). Bu yüzden 👍/👎 geri bildirimleri sessizce
-- kaydedilemiyor, admin istatistiklerinde de "no such column: helpful" hatası
-- çıkıyordu.
ALTER TABLE tickets ADD COLUMN helpful INTEGER;
