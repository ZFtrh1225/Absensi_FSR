# GAS Backend — Action Baru yang Harus Ditambahkan

Frontend baru (PRIORITAS 2 & 3) butuh beberapa endpoint baru di Google Apps Script.
Semua endpoint dipanggil dengan pattern lama: `apiCall({ action: '<nama>', ... })`.

Frontend sudah aman terhadap backend lama: kalau action belum ada, halaman tetap
jalan (Dashboard fallback ke kalkulasi lokal, Absensi fallback ke `getTodayAbsensi`).
Tapi untuk fitur penuh, tambahkan action di bawah.

---

## 1. Sheet "Users" — Kolom Tambahan

Tambahkan kolom (kalau belum ada) di sheet `Users`:

| id_karyawan | nama | pin | role | email | no_hp | departemen | jabatan | tanggal_masuk | status |
|-------------|------|-----|------|-------|-------|------------|---------|---------------|--------|

- `status` valuenya: `active` atau `inactive` (default `active`)
- `tanggal_masuk` format: `YYYY-MM-DD`

Login wajib mengecek `status !== 'inactive'`. User nonaktif tolak login dengan
pesan: `"Akun Anda dinonaktifkan. Hubungi admin."`

---

## 2. Action: `getUsers` — Tambahkan Field

Response sekarang harus include semua kolom baru:
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
      "departemen": "IT",
      "jabatan": "Staff",
      "tanggal_masuk": "2024-01-15",
      "status": "active"
    }
  ]
}
```

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
  "departemen": "Finance",
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
      "departemen": "IT",
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
> Tambahkan field `departemen` di setiap record kalau bisa (lookup dari sheet Users
> saat write atau saat read). Frontend juga punya fallback dari user list, tapi
> server-side lebih akurat.

---

## 9. Action: `getDashboardStats`

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
      { "id_karyawan": "EMP010", "nama": "Andi",  "departemen": "IT",      "tepat_waktu": 22 },
      { "id_karyawan": "EMP005", "nama": "Rina",  "departemen": "HRD",     "tepat_waktu": 21 },
      { "id_karyawan": "EMP012", "nama": "Joko",  "departemen": "Finance", "tepat_waktu": 20 },
      { "id_karyawan": "EMP003", "nama": "Wati",  "departemen": "IT",      "tepat_waktu": 19 },
      { "id_karyawan": "EMP008", "nama": "Doni",  "departemen": "Ops",     "tepat_waktu": 18 }
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
2. [ ] Tab Overview di admin: KPI muncul, chart kebaca, leaderboard ada isi
3. [ ] Tab Karyawan: search bekerja, filter departemen muncul, tombol "Tambah Karyawan" buka modal
4. [ ] Add karyawan baru → muncul di tabel
5. [ ] Edit karyawan → field ke-update di sheet
6. [ ] Reset PIN → user terima email, PIN sheet ter-update
7. [ ] Nonaktifkan karyawan → user tidak bisa login lagi
8. [ ] Tab Absensi: filter tanggal range jalan, export CSV download file
9. [ ] Tombol "Laporan Bulan Ini" download CSV bulan berjalan
10. [ ] Login: klik "Lupa PIN?" → modal muncul → submit kirim email ke admin
11. [ ] PWA: buka di Chrome mobile → muncul "Add to Home Screen"
12. [ ] Setelah install: jam 07:55 WIB notifikasi muncul (tab harus pernah dibuka hari itu)
