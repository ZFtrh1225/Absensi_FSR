# Pengingat Absensi FSR

Aplikasi yang dipasang dari browser adalah PWA. Pengingat harian saat aplikasi
tertutup memerlukan server Web Push yang **selalu berjalan**. Timer di halaman
atau service worker saja tidak dapat menjadwalkan notifikasi pada pukul tertentu
ketika browser menutup halaman.

## Sekali saat penyiapan

1. Host `index.html`, `sw.js`, `manifest.json` dan `push-config.js` lewat
   HTTPS pada origin PWA yang sama. Pengguna lama tidak perlu memasang ulang.
2. Buat pasangan VAPID satu kali: `npx web-push generate-vapid-keys`.
   **Simpan kunci privat sebagai rahasia server dan jangan ubah lagi.**
3. Jalankan server ini pada host HTTPS yang terus menyala. Set:
   - `APP_ORIGIN=https://<domain-pwa>` (origin persis, tanpa path atau slash).
   - `VAPID_PUBLIC_KEY=<kunci-publik>`
   - `VAPID_PRIVATE_KEY=<kunci-privat>`
   - `VAPID_SUBJECT=mailto:<email-admin>`
   - `PUSH_DATA_FILE=/data/subscriptions.json`
4. Pastikan direktori `/data` persisten melalui volume disk. Jalankan hanya
   **satu replika** server; jika menggunakan banyak replika, pindahkan state ke
   database bersama dan gunakan satu scheduler terpilih.
5. Di `push-config.js`, isi `window.ABSENSI_PUSH_API` dengan URL HTTPS server
   tanpa slash akhir, lalu terbitkan pembaruan frontend.
6. Pengguna membuka PWA yang sudah dipasang, login sebagai karyawan, mengetuk
   **Aktifkan** pada kartu Pengingat absensi dan mengizinkan notifikasi.
   Admin dan pengguna yang belum memberi izin tidak didaftarkan.

Contoh menjalankan lokal untuk pengembangan: `npm install && npm test && npm start`.
Gunakan reverse proxy HTTPS di produksi; server mendengarkan HTTP pada port 8787.
Jangan mengirim PIN, nama, atau catatan absensi ke endpoint push. Server hanya
menyimpan subscription browser dan mengirim dua pesan generik setiap hari
menurut `Asia/Jakarta`: **08.00** dan **17.01 WIB**. Kegagalan jaringan, mode
hemat baterai, dan layanan push browser dapat menunda pengantaran.

## Pembaruan PWA

Service worker mengambil HTML dan konfigurasi terbaru dari jaringan, lalu
memakai cache ketika offline. Setelah rilis, perangkat mengambil versi baru
saat PWA dibuka kembali. Untuk perubahan shell/offline, ubah `CACHE_NAME`
di `sw.js` agar cache lama dihapus. Pemeriksaan update juga berjalan saat
PWA kembali aktif dan setiap 30 menit saat terlihat. Instalasi ulang tidak
diperlukan. Pastikan hosting tidak menahan `sw.js` terlalu lama di HTTP cache.

## Verifikasi

- `GET /api/push/config` mengembalikan kunci publik.
- Setelah menekan Aktifkan, browser mengirim `POST /api/push/subscriptions`.
- Kartu menampilkan “Aktif: pengingat 08.00 dan 17.01 WIB.”
- Setelah menutup PWA, kirim uji push menggunakan subscription dan kunci
  VAPID pada lingkungan uji; periksa notifikasi sistem dan klik untuk membuka PWA.
- `npm test` menguji kedua waktu WIB dan menghindari menit yang bersebelahan.
- Saat logout, subscription dihapus dan browser di-unsubscribe. Login kembali
  menyambungkan lagi apabila pengguna sebelumnya sudah memilih Aktifkan.

Endpoint pendaftaran terbuka untuk browser dari origin aplikasi dan mengirim
pesan generik saja. Origin dan CORS **bukan autentikasi**: untuk deployment
publik berskala besar, lindungi endpoint dari penyalahgunaan dengan autentikasi
server dan pembatasan laju di reverse proxy. Jangan gunakan endpoint ini untuk
pesan berisi data pribadi tanpa autentikasi.
