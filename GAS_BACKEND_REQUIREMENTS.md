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

## 7. ⚠ Troubleshooting "Action tidak dikenali"

Gejala: Klik **Tambah Karyawan / Edit / Nonaktifkan / Reset PIN** → toast merah:
```
Action tidak dikenali: "addUser"
Action tidak dikenali: "updateUser"
Action tidak dikenali: "setUserStatus"
Action tidak dikenali: "resetPin"
```

Artinya: router `handleRequest` (atau `doGet/doPost`) di Code.gs Anda tidak
punya cabang `case` untuk action tersebut, sehingga jatuh ke `default:` →
"Action tidak dikenali". Penyebab paling umum: handler-handler baru di-paste
sebagai _stand-alone function_ di akhir file, tapi switch statement di router
tidak ikut di-update. Walau fungsinya ada, router tidak akan memanggilnya.

**Cara perbaiki — PALING MUDAH (Drop-in Replace):**

1. Buka Apps Script editor (Extensions → Apps Script di Spreadsheet).
2. Buka file `backend/Code.gs.example` di repo ini.
3. **Copy SELURUH isinya**.
4. **Hapus SELURUH isi `Code.gs` Anda** lalu paste isi yang baru.
5. Update `SPREADSHEET_ID` dan `SELFIE_FOLDER_ID` di section CONFIG sesuai
   nilai yang Anda pakai sebelumnya.
6. **Authorize**: dropdown fungsi → pilih `handleAddUser` → klik **Run**.
   Dialog "Authorization required" → **Review permissions** → **Advanced** →
   **Go to {project} (unsafe)** → **Allow**. Ulangi untuk `handleResetPin`
   (perlu izin `MailApp` tambahan).
7. **Deploy ulang Web App**: Deploy → Manage Deployments → Edit (ikon pensil)
   → Version: **New version** → Deploy. Pastikan "Execute as: Me",
   "Who has access: Anyone".

> ⚠ **Jangan paste partial / merge manual.** Pengalaman menunjukkan banyak
> orang lupa update switch statement di `handleRequest`, sehingga handler
> baru tidak pernah dipanggil walau fungsinya sudah ada di file. Drop-in
> replace lebih aman dan menjamin router ikut di-update.

**Apa yang sudah otomatis di-handle oleh `Code.gs.example` v3.0.0:**

- ✅ Switch statement di `handleRequest` punya case untuk semua action baru:
  `addUser`, `updateUser`, `setUserStatus`, `resetPin`, `getAbsensiRange`.
- ✅ Auto-add kolom `Email`, `No_HP`, `Jabatan`, `Tanggal_Masuk`, `Status` ke
  sheet `Users` saat addUser/updateUser pertama kali (kalau belum ada).
- ✅ `handleGetUsers` return semua field termasuk `jabatan`, `tanggal_masuk`
  (sebelumnya hanya return id/nama/role → makanya Jabatan kosong di tabel admin).
- ✅ `handleLogin` reject user dengan `status='inactive'` (soft-delete benar
  mengunci akun).
- ✅ Header sheet matched case+format insensitive — "ID_Karyawan" sama dengan
  "id_karyawan" sama dengan "ID Karyawan".

Setelah langkah ini, semua action di tab Karyawan akan jalan.

---

## 8. Action: `getAbsensiRange` (untuk Tab Absensi)

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
5. [ ] Add karyawan baru → muncul di tabel, kolom Jabatan & Tgl Masuk terisi
6. [ ] Edit karyawan → semua field (termasuk Jabatan & Tgl Masuk) ter-load di modal
7. [ ] Reset PIN → user terima email, PIN sheet ter-update
8. [ ] Nonaktifkan karyawan → user tidak bisa login lagi
9. [ ] Tab Absensi: filter tanggal range jalan, badge tampil "Masuk"/"Pulang"
10. [ ] Tab Absensi: keterangan telat ≥ 60 menit muncul format "X jam Y menit"
11. [ ] Tab Absensi: badge lokasi tampil "Di Kantor" / "Diluar Kantor"
12. [ ] Tab Pengajuan: muncul tabel dengan kolom Pengajuan, Nama, Jabatan, Mulai, Akhir, Lama, Alasan, Status, Aksi
13. [ ] PWA: buka di Chrome mobile → muncul "Add to Home Screen"
14. [ ] Halaman Karyawan di HP: tombol "Masuk" / "Pulang", status "JAM MASUK" / "JAM PULANG"
15. [ ] Setelah install: jam 07:55 WIB notifikasi "Jangan lupa absen Masuk!" muncul
