# GAS Backend — Action Baru yang Harus Ditambahkan

Frontend baru (PRIORITAS 2 & 3) butuh beberapa endpoint baru di Google Apps Script.
Semua endpoint dipanggil dengan pattern lama: `apiCall({ action: '<nama>', ... })`.

Frontend sudah aman terhadap backend lama: kalau action belum ada, halaman tetap
jalan (Dashboard fallback ke kalkulasi lokal, Absensi fallback ke `getTodayAbsensi`).
Tapi untuk fitur penuh, tambahkan action di bawah.

> ⚠ **MIGRASI:** Kolom `departemen` SUDAH DIHAPUS dari aplikasi (sheet `Users` &
> `Absensi`, semua endpoint, dan UI admin). Kalau sheet existing masih punya
> kolom `departemen`, **hapus kolomnya** atau biarkan kosong — frontend tidak
> akan mengirim/membaca field ini lagi. Lihat bagian "Migrasi" di bawah.

---

## 1. Sheet "Users" — Skema Kolom

Skema kolom sheet `Users` (urutan boleh menyesuaikan, yang penting nama header sama):

| id_karyawan | nama | pin | role | email | no_hp | jabatan | tanggal_masuk | status |
|-------------|------|-----|------|-------|-------|---------|---------------|--------|

- `status` valuenya: `active` atau `inactive` (default `active`)
- `tanggal_masuk` format: `YYYY-MM-DD`

Login wajib mengecek `status !== 'inactive'`. User nonaktif tolak login dengan
pesan: `"Akun Anda dinonaktifkan. Hubungi admin."`

---

## 2. Action: `getUsers` — Field yang Dikembalikan

```json
{
  "success": true,
  "users": [
    {
      "id_karyawan": "EMP001",
      "nama": "Budi",
      "role": "Karyawan",
      "email": "budi@fsr.com",
      "no_hp": "08123456789",
      "jabatan": "Staff",
      "tanggal_masuk": "2024-01-15",
      "status": "active"
    }
  ]
}
```

> Field `departemen` tidak lagi diperlukan dan akan diabaikan oleh frontend.

---

## 3. Action: `addUser`

**Request:**
```json
{
  "action": "addUser",
  "id_karyawan": "EMP002",
  "nama": "Siti",
  "email": "siti@fsr.com",
  "no_hp": "0812...",
  "jabatan": "Manager",
  "tanggal_masuk": "2026-05-28",
  "role": "Karyawan",
  "pin": "123456"
}
```

**Behavior:**
- Validasi `id_karyawan` belum ada → kalau duplikat balas `{ success:false, message:"ID sudah terdaftar." }`
- Append row baru ke sheet `Users` dengan `status='active'`
- PIN sebaiknya di-hash (mis. SHA-256) sebelum disimpan, kalau backend lama sudah
  pakai plaintext biarkan dulu — tapi catat untuk migrasi

**Response:** `{ success:true, message:"Karyawan ditambahkan." }`

---

## 4. Action: `updateUser`

**Request:** sama seperti `addUser` tapi `pin` opsional (kalau kosong, jangan ubah PIN).
`id_karyawan` adalah kunci pencarian (tidak diubah).

**Response:** `{ success:true, message:"Data karyawan diperbarui." }`

---

## 5. Action: `setUserStatus` (soft delete / aktifkan kembali)

**Request:**
```json
{ "action": "setUserStatus", "id_karyawan": "EMP002", "status": "inactive" }
```
`status` hanya `"active"` atau `"inactive"`.

**Response:** `{ success:true, message:"Status diperbarui." }`

---

## 6. Action: `resetPin` (admin trigger)

**Request:**
```json
{ "action": "resetPin", "id_karyawan": "EMP002" }
```

**Behavior:**
- Generate PIN random 6 digit (`Math.floor(100000 + Math.random()*900000)`)
- Update PIN di sheet `Users`
- Kirim email ke `email` user pakai `MailApp.sendEmail()`:
  ```
  Subject: PIN Absensi FSR Anda Telah Direset
  Body:
  Halo {nama},
  PIN Absensi FSR Anda telah direset oleh admin.
  PIN baru: {newPin}
  Mohon segera login dan ubah PIN Anda.
  ```

**Response:**
```json
{ "success": true, "message": "PIN direset dan dikirim ke email.", "new_pin": "482917" }
```
> `new_pin` opsional. Frontend akan menampilkannya ke admin di toast supaya admin bisa
> verbal-relay ke karyawan kalau email tidak masuk. Kalau alasan keamanan tidak mau
> kirim PIN balik ke admin, hilangkan field ini.

---

## 7. Action: `requestPinReset` (dari halaman login "Lupa PIN?")

**Request:**
```json
{ "action": "requestPinReset", "id_karyawan": "EMP002", "email": "siti@fsr.com" }
```

**Behavior:**
- Validasi `id_karyawan` dan `email` cocok di sheet `Users`
- Kalau cocok:
  - Catat permintaan di sheet `PinResetRequests` (kolom: timestamp, id_karyawan, email, status)
  - Kirim email ke admin (atau alamat email yang di-set di Script Properties `ADMIN_EMAIL`):
    ```
    Subject: Permintaan Reset PIN — {nama} ({id_karyawan})
    Body: Karyawan {nama} ({id_karyawan}) meminta reset PIN.
    Klik buka admin panel untuk memprosesnya.
    ```
- Kalau tidak cocok: balas `{ success:false, message:"ID atau email tidak cocok." }`

**Response sukses:**
```json
{ "success": true, "message": "Permintaan dikirim. Admin akan memproses dalam 1x24 jam." }
```

> 💡 **Implementasi siap-paste:** Lihat `backend/Code.gs.example` di repo ini.

### ⚠ Troubleshooting "Failed to fetch" pada Lupa PIN

Gejala: User klik "Kirim Permintaan" → muncul "Gagal: Failed to fetch".

Root cause yang paling sering: handler `requestPinReset` di GAS men-throw
exception (biasanya karena `MailApp.sendEmail` belum di-authorize), GAS lalu
membalas HTML error page, dan fetch frontend gagal mem-parse response sehingga
melapor "Failed to fetch".

**Cara perbaiki:**

1. Pastikan handler ada — paste fungsi `requestPinReset` dari `backend/Code.gs.example`.
2. Authorize scope MailApp:
   - Di editor Apps Script, klik dropdown fungsi → pilih `requestPinReset` → klik **Run**.
   - Akan muncul dialog "Authorization required" → klik **Review permissions**.
   - Login Google → klik **Advanced** → **Go to {project} (unsafe)** → **Allow**.
   - Setelah diberi izin, fungsi akan exit dengan error karena dipanggil tanpa
     payload — itu normal. Yang penting izin sudah di-grant.
3. Set Script Property `ADMIN_EMAIL` ke email admin yang menerima notifikasi.
4. Deploy ulang Web App: **Deploy → Manage Deployments → Edit → Version: New version → Deploy**.
5. Pastikan deployment di-set "Execute as: Me" dan "Who has access: Anyone".

Frontend sekarang sudah tahan banting: kalau `requestPinReset` gagal,
muncul modal "Permintaan Tidak Terkirim" dengan tombol **Email Admin** yang
membuka aplikasi email pengguna dengan template siap kirim. Kalau Anda mengisi
constant `ADMIN_CONTACT_EMAIL` di `index.html` (di sebelah `GAS_URL`), email
otomatis ditujukan ke admin tersebut.

---

## 8. Action: `getAbsensiRange` (untuk Tab Absensi & export)

**Request:**
```json
{ "action": "getAbsensiRange", "from": "2026-05-01", "to": "2026-05-28" }
```

**Behavior:**
- Filter sheet `Absensi` di mana `DATE(timestamp)` antara `from` dan `to` (inklusif)
- Kalau perlu, sebaiknya batasi maksimum 92 hari supaya tidak timeout

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "timestamp": "2026-05-28 08:13:42",
      "id_karyawan": "EMP001",
      "nama": "Budi",
      "tipe_absen": "Check-In",
      "latitude": -5.395,
      "longitude": 105.220,
      "in_radius": true,
      "distance": 12,
      "link_maps": "https://www.google.com/maps?q=..."
    }
  ]
}
```
> Catatan: `tipe_absen` tetap menggunakan nilai `"Check-In"` / `"Check-Out"` di
> backend agar kompatibel dengan data lama. UI menampilkannya sebagai
> "Masuk" / "Pulang".

---

## 9. Action: `getDashboardStats`

> ✅ **Status: OPSIONAL.** Frontend sekarang menghitung weekly chart & leaderboard
> sendiri dari data `getAbsensiRange` (fallback otomatis kalau backend tidak
> punya action ini). Implementasikan handler ini hanya jika Anda ingin angka
> yang lebih akurat (misalnya: leaderboard yang memperhitungkan izin/cuti
> approved, weekly chart yang skip hari libur nasional, dsb.).
>
> 💡 Implementasi siap-paste tersedia di `backend/Code.gs.example`.

**Request:**
```json
{ "action": "getDashboardStats" }
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalKaryawan": 42,
    "hadirHariIni": 38,
    "telatHariIni": 5,
    "tidakHadir": 4,
    "weekly": [
      { "date": "2026-05-22", "label": "Jum", "hadir": 35, "telat": 3, "alpa": 4 },
      { "date": "2026-05-23", "label": "Sab", "hadir": 0,  "telat": 0, "alpa": 0 },
      { "date": "2026-05-24", "label": "Min", "hadir": 0,  "telat": 0, "alpa": 0 },
      { "date": "2026-05-25", "label": "Sen", "hadir": 36, "telat": 4, "alpa": 2 },
      { "date": "2026-05-26", "label": "Sel", "hadir": 38, "telat": 2, "alpa": 2 },
      { "date": "2026-05-27", "label": "Rab", "hadir": 39, "telat": 1, "alpa": 2 },
      { "date": "2026-05-28", "label": "Kam", "hadir": 33, "telat": 5, "alpa": 4 }
    ],
    "leaderboard": [
      { "id_karyawan": "EMP010", "nama": "Andi",  "tepat_waktu": 22 },
      { "id_karyawan": "EMP005", "nama": "Rina",  "tepat_waktu": 21 },
      { "id_karyawan": "EMP012", "nama": "Joko",  "tepat_waktu": 20 },
      { "id_karyawan": "EMP003", "nama": "Wati",  "tepat_waktu": 19 },
      { "id_karyawan": "EMP008", "nama": "Doni",  "tepat_waktu": 18 }
    ]
  }
}
```

**Tip implementasi:**
- `hadirHariIni` = unique `id_karyawan` dengan `tipe_absen='Check-In'` di hari ini
- `telatHariIni` = check-in yang waktunya > `JAM_MASUK + TOLERANSI_MENIT`
- `tidakHadir` = `totalKaryawan - hadirHariIni` (kecualikan yang status 'inactive' atau yang punya izin/cuti approved hari ini)
- `weekly` = loop 7 hari terakhir, hitung 3 metric per hari
- `leaderboard` = top 5 user dengan jumlah check-in tepat waktu paling banyak di bulan berjalan

---

## 10. (Opsional) Auto-trigger reset request

Kalau mau, bikin trigger time-based di GAS yang setiap pagi kirim ringkasan:
- Total karyawan tidak absen di hari sebelumnya
- Pending izin/cuti yang belum di-approve
- Pending PIN reset request

---

## 11. Migrasi: Hapus Kolom `departemen`

Untuk sheet `Users` & `Absensi` lama yang masih punya kolom `departemen`:

**Opsi A — Hapus kolom (rekomendasi):**
1. Buka sheet di Google Sheets.
2. Klik header kolom `departemen` → klik kanan → "Delete column".
3. Lakukan untuk sheet `Users` dan sheet `Absensi` (kalau ada).

**Opsi B — Biarkan saja:**
- Frontend tidak akan mengirim/membaca field `departemen` lagi, jadi kolom ini
  akan berisi nilai lama (read-only). Tidak akan ada error.

**Update kode GAS yang masih merefer ke `departemen`:**
- Hapus baris `setValue(departemen)` / `getValue` untuk kolom departemen di
  fungsi `addUser`, `updateUser`, `submitAbsensi`, `getUsers`, `getAbsensiRange`,
  dan `getDashboardStats` (di leaderboard).
- Hapus parameter `departemen` di handler request.

---

## File Static yang Perlu Dipublikasikan

PWA butuh file ini bisa diakses publik (selain `index.html`):
- `manifest.json` — sudah dibuat
- `sw.js` — sudah dibuat

Kalau hosting di GitHub Pages atau Netlify: file otomatis ke-serve. Kalau hosting
di GAS (`HtmlService`), service worker tidak akan jalan karena GAS men-serve di
bawah domain `script.google.com` dan tidak bisa di-register sebagai SW. Untuk
PWA penuh, host file ini di GitHub Pages / Netlify / Vercel — backend GAS tetap
bisa dipanggil dari domain manapun.

---

## Quick Test Checklist

Setelah deploy backend baru, cek di urutan ini:

1. [ ] Login user lama masih jalan
2. [ ] Login bisa input ID dengan huruf (mis. `EMP001`) — keyboard HP harus tampil alfanumerik
3. [ ] Tab Overview di admin: KPI muncul, chart kebaca, leaderboard ada isi
4. [ ] Tab Karyawan: search bekerja, tombol "Tambah Karyawan" buka modal (tidak ada field Departemen)
5. [ ] Add karyawan baru → muncul di tabel (kolom Departemen tidak ada)
6. [ ] Edit karyawan → field ke-update di sheet
7. [ ] Reset PIN → user terima email, PIN sheet ter-update
8. [ ] Nonaktifkan karyawan → user tidak bisa login lagi
9. [ ] Tab Absensi: filter tanggal range jalan, badge tampil "Masuk"/"Pulang"
10. [ ] Export CSV download file (header tanpa kolom Departemen)
11. [ ] Tombol "Laporan Bulan Ini" download CSV bulan berjalan
12. [ ] Login: klik "Lupa PIN?" → modal muncul → submit kirim email ke admin
13. [ ] PWA: buka di Chrome mobile → muncul "Add to Home Screen"
14. [ ] Halaman Karyawan di HP: tombol "Masuk" / "Pulang", status "JAM MASUK" / "JAM PULANG"
15. [ ] Setelah install: jam 07:55 WIB notifikasi "Jangan lupa absen Masuk!" muncul
