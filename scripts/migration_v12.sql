-- v12: SSS cevaplarına da kaynak bağlanabilsin.
-- Bir talep SSS havuzuna alınırken AI'ın kullandığı kaynaklar da kopyalanıyor;
-- böylece havuzdan gelen cevaplarda da "şartname · s.34" rozeti çıkıyor.
ALTER TABLE faqs ADD COLUMN sources TEXT;
