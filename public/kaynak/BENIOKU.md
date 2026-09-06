# Kaynak PDF'leri

Cevapların altındaki kaynak rozetine tıklanınca açılan şartname ve kılavuz
PDF'leri bu klasörden servis edilir.

Bu belgeler **TEKNOFEST / T3 Vakfı'na aittir** ve telif nedeniyle bu depoya
dahil edilmemiştir. Projeyi kendi hesabınızda çalıştıracaksanız aşağıdaki
dosyaları teknofest.org üzerinden indirip bu klasöre tam olarak bu adlarla
koyun:

| Dosya adı | Belge |
|---|---|
| `iha-sartnamesi-2026.pdf` | İHA Yarışmaları Şartnamesi 2026 |
| `sabit-doner-gorev-videosu.pdf` | Sabit-Döner Kanat Görev Videosu Hazırlama Kılavuzu |
| `serbest-gorev-videosu.pdf` | Serbest Görev Kategorisi Görev Videosu Hazırlama Kılavuzu |
| `sabit-doner-psr.pdf` | Sabit-Döner PSR Hazırlama Kılavuzu |
| `serbest-gorev-psr.pdf` | Serbest Görev PSR Hazırlama Kılavuzu |

Eşleştirme `src/worker/index.ts` içindeki `STATIK_KAYNAKLAR` sözlüğünde
tanımlıdır. Dosya yoksa kaynak rozeti bağlantıya dönüşmez, düz metin olarak
görünür — sistem çalışmaya devam eder.
