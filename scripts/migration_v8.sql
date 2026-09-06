-- v8: yeni yarışmaların (5G Akıllı Yol Güvenliği, Biyoteknoloji, Blokzincir,
-- Çip Tasarım) resmi şartnameleri bilgi tabanına eklendi. Bu migration, İçerik
-- Yöneticisi panelinde "Kaynak listesi ve geçerlilik durumu" bölümünde
-- görünmeleri için belge kayıtlarını oluşturur. Vektörler `npm run ingest:new`
-- + `npm run vectorize:insert-new` ile Vectorize'a yüklenir.
INSERT INTO documents (competition_id, title, filename, version, status, chunk_count, total_chunks) VALUES
  ('5g_yz_yol', '5G & Yapay Zeka FTR Aşaması Teslim Dokümanı', '5G_ve_Yapay_Zeka_ile_Akıllı_Yol_Güvenliği_Yarışması_-_FTR_Aşaması_Tesl.pdf', '2026', 'aktif', 20, 20),
  ('5g_yz_yol', '5G & Yapay Zeka ile Akıllı Yol Güvenliği Şartnamesi 2026', '2026_5G_YAPAY_ZEKA_İLE_AKILLI_YOL_GÜVENLİĞİ_YARISMASI_SARTNAMESI_2_POR.pdf', '2026', 'aktif', 39, 39),
  ('biyoteknoloji', 'Biyoteknoloji İnovasyon Yarışması Şartnamesi 2026', '2026-TR_Biyoteknoloji_İnovasyon_Yarışması_Şartname-_1I5Kr.pdf', '2026', 'aktif', 51, 51),
  ('blokzincir', 'Blokzincir Yarışması Şartnamesi 2026', '2026_BLOKZİNCİR_YARIŞMASI_ŞARTNAMESİ_TR.20_02_rBh8h.pdf', '2026', 'aktif', 29, 29),
  ('cip_tasarim', 'Çip Tasarım Yarışması Şartnamesi 2026', '2026_Çip_Tasarım_Yarışması_Şartnamesi_v1_3_draft_1_LK3oV.pdf', '2026', 'aktif', 77, 77);
