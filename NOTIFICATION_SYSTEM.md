# Sistem Pengingat Absensi FSR

Pengingat dikirim lewat Web Push pada **08.00 dan 17.01 WIB** setiap hari. Panduan arsitektur, pengaturan server, langkah pemasangan, dan pengujian tersedia di [push-server/README.md](push-server/README.md).

File `notification-manager.js`, `notification-integration.html`, `auto-update-manager.js`, dan `auto-update-integration.html` adalah percobaan lama dan tidak dipakai oleh `index.html`. Timer di halaman tidak dapat mengirim pengingat ketika PWA tertutup. Implementasi aktif berada di `index.html`, `sw.js`, `push-config.js`, dan `push-server/`.
