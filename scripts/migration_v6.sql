-- v6: İHA yarışması için SSS havuzunu 2'den 10 soruya çıkarır. Hepsi şartnamenin
-- gerçek maddelerinden alınmıştır (uydurma değildir), madde numarası cevabın
-- sonunda belirtilir — tıpkı AI'nin kendi ürettiği cevaplardaki format gibi.
INSERT INTO faqs (competition_id, question, answer) VALUES
  ('iha', 'İHA''nın ağırlık sınırı nedir?',
   'Sabit Kanat ve Döner Kanat kategorilerinde İHA''nın toplam kalkış ağırlığı 4 kg''ı geçemez. Serbest Görev kategorisinde bu sınır 25 kg''dır. (Madde 9.3.1)'),
  ('iha', 'Acil durum güç kesme mekanizması nasıl olmalı?',
   'İHA üzerinde, harici bir akım kesici kullanılmadan sisteme güç veren ve gücü kesen, kolay erişilebilir entegre bir Power On/Off anahtarı bulunmalıdır. Bu anahtar gücü en fazla 2 saniye içinde kesebilmelidir; aksi hâlde İHA''nın uçuşuna izin verilmez. (Madde 9.3.4)'),
  ('iha', 'Telemetri kullanımı zorunlu mu?',
   'Sabit Kanat ve Döner Kanat kategorilerinde uçtan uca şifrelemeye sahip telemetri kullanımı zorunludur. Şifrelemesiz telemetri, diğer takımların İHA''larını etkileme riski taşır ve bundan doğacak sorumluluk takıma aittir. (Madde 9.4)'),
  ('iha', 'Uçuş emniyeti kontrolünde neler kontrol edilir?',
   'Tüm İHA''lar uçuş öncesi emniyet kontrolünden geçer; bu kontrolde İHA''nın Proje Sunum Raporu''ndaki teknik çizimlerle uyumu, yapısal/elektriksel/mekanik güvenilirliği, bileşenlerin emniyetli montajı ve bağlantıların sağlamlığı incelenir. Kontrolden geçemeyen İHA''lar uçurulamaz. (Madde 9.2)'),
  ('iha', 'Sabit Kanat kategorisinde kaç görev var ve ne test ediliyor?',
   'Sabit Kanat kategorisinde iki görev vardır. Birinci görevde otonom uçuş kabiliyeti, muhafaza kutusundan çıkış hızı, hafiflik, uçuş hızı, kararlılık ve manevra kabiliyeti; ikinci görevde ise birinci görevdeki isterlere ek gereksinimler test edilir. (Madde 3.1)'),
  ('iha', 'Yarışma alanı ne büyüklükte olacak?',
   'Tarama yapılacak alanın yaklaşık 30 x 100 metre olması, Sabit ve Döner Kanat kategorilerinde iki direk arası mesafenin ise 150 metre olması planlanmaktadır. Kesin ölçüler, yarışma alanı netleştikten sonra ayrıca duyurulacaktır. (Madde 7)'),
  ('iha', 'Manevra hareketini yapamayan takıma ne oluyor?',
   'Diğer gereksinimleri (otonomi, hızlı uçuş vb.) karşılasa bile manevra hareketini yapamayan takımlar birinci görevden sıfır (0) puan alır. (Madde 8.3.7)'),
  ('iha', 'Güvenlik tedbirlerine uyulmazsa ne olur?',
   'Belirtilen güvenlik tedbirlerinin (örn. önceden test uçuşu yapılmamış araçların ilk kez yarışmada denenmesi gibi durumların) ihlali hâlinde, TÜBİTAK''ın görüşü ve onayı doğrultusunda DDK her türlü yaptırımı uygulama hakkına sahiptir. (Madde 14.3)');
