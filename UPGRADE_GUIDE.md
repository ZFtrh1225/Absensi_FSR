# 🚀 Upgrade Guide — Absensi FSR v1.0 → v2.0

Panduan ini membantu Anda mengupgrade backend Google Apps Script dari versi 1.0 ke versi 2.0 (Priority 1 + Dark Mode + Custom Modal).

---

## 📋 Ringkasan Perubahan Backend

| Tipe | Apa yang Berubah |
|---|---|
| ✏️ **Update** | `submitAbsensi` — sekarang simpan selfie ke Drive + status cerdas |
| ✏️ **Update** | `getTodayAbsensi` — tambahan field `selfie_url`, `in_radius`, `distance`, `status` |
| ➕ **Baru** | `getMyTodayStatus` — status absen hari ini per karyawan |
| ➕ **Baru** | `getMyMonthly` — data bulanan untuk kalender |
| ➕ **Baru** | `submitIzin` — submit pengajuan izin/cuti |
| ➕ **Baru** | `getMyIzin` — riwayat pengajuan per karyawan |
| ➕ **Baru** | `getAllIzin` — semua pengajuan (admin) |
| ➕ **Baru** | `updateIzinStatus` — approve/reject izin |

---

## 🔧 LANGKAH 1 — Update Struktur Sheet

### A. Sheet "Absensi" — Tambah 4 Kolom Baru

Buka sheet **"Absensi"** di Google Sheet Anda. Header sebelumnya:

```
Timestamp | ID_Karyawan | Nama | Tipe_Absen | Latitude | Longitude | Link_Google_Maps
```

**Tambahkan 4 kolom baru di sebelah kanan** (kolom H, I, J, K):

| H | I | J | K |
|---|---|---|---|
| `Selfie_URL` | `In_Radius` | `Distance_M` | `Status` |

Header lengkap setelah update:
```
Timestamp | ID_Karyawan | Nama | Tipe_Absen | Latitude | Longitude | Link_Google_Maps | Selfie_URL | In_Radius | Distance_M | Status
```

### B. Sheet "Izin" — BUAT BARU

1. Klik tab `+` di bawah → **buat sheet baru** dengan nama persis: **`Izin`**
2. Isi Row 1 dengan header berikut:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| `Timestamp` | `ID_Karyawan` | `Nama` | `Tipe` | `Dari` | `Sampai` | `Alasan` | `Status` | `Approved_By` | `Approved_At` |

---

## 🔧 LANGKAH 2 — Buat Folder Drive untuk Selfie (Opsional tapi Direkomendasikan)

1. Buka [Google Drive](https://drive.google.com)
2. Klik **+ New** → **Folder** → beri nama `Absensi FSR Selfies`
3. Buka folder tersebut, copy ID-nya dari URL:
   ```
   https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp...
                                            └────── INI ID-nya ──────┘
   ```
4. Pastekan ID itu di file `Code.gs`, baris:
   ```javascript
   const SELFIE_FOLDER_ID = 'PASTE_DI_SINI';
   ```

**Catatan:** Jika `SELFIE_FOLDER_ID` dikosongkan, fitur selfie tetap jalan di frontend tapi foto tidak disimpan ke Drive (kolom `Selfie_URL` akan kosong).

---

## 🔧 LANGKAH 3 — Copy-Paste Kode Backend

1. Buka **Google Apps Script** project Anda (yang terhubung ke Spreadsheet).
2. **Hapus seluruh isi** file `Code.gs` lama.
3. Copy-paste **isi file [`Code.gs`](./Code.gs)** dari repository ini.
4. Pastikan baris-baris ini sudah benar:
   ```javascript
   const SPREADSHEET_ID    = '147vlK6BxUrEOYqD27MedD0avqqjI8Ed3mMA1Z95U3VI'; // ID Sheet Anda
   const SELFIE_FOLDER_ID  = '1AbCdEf...';                                    // ID folder Drive
   ```
5. Klik **Save** (Ctrl+S).

---

## 🔧 LANGKAH 4 — Re-Deploy Web App

⚠️ **PENTING:** Setiap kali Anda mengedit kode, harus buat **NEW DEPLOYMENT** (jangan cuma "Manage Deployments"), supaya kode terbaru aktif.

1. Klik tombol **Deploy** (kanan atas) → **New deployment**
2. Tipe: **Web app**
3. Konfigurasi:
   - **Description:** `v2.0 — Selfie + Geofencing + Izin`
   - **Execute as:** `Me`
   - **Who has access:** `Anyone`
4. Klik **Deploy**
5. Authorize permissions baru (Drive + Spreadsheet)
6. **Copy URL Web App** yang baru
7. Paste URL itu di `index.html`:
   ```javascript
   const GAS_URL = 'https://script.google.com/macros/s/XXXXXX/exec';
   ```

---

## 🔧 LANGKAH 5 — Update Frontend Config

Edit `index.html`, cari section **CONFIG** (sekitar baris 600-an), isi:

```javascript
const GAS_URL = 'https://script.google.com/macros/s/XXXXXX/exec';

// Geofencing — KOORDINAT KANTOR ANDA
const OFFICE_LAT      = -6.200000;   // Ganti dengan latitude kantor
const OFFICE_LON      = 106.816666;  // Ganti dengan longitude kantor
const GEOFENCE_RADIUS = 100;          // Radius dalam meter

// Jam Kerja Standar
const JAM_MASUK       = '08:00';
const JAM_PULANG      = '17:00';
const TOLERANSI_MENIT = 15;
```

### Cara Mendapatkan Koordinat Kantor:
1. Buka [Google Maps](https://maps.google.com)
2. Cari alamat kantor Anda
3. Klik kanan di titik kantor → angka pertama yang muncul = `latitude, longitude`
4. Contoh hasil: `-6.175392, 106.827153` → masukkan ke config

⚠️ **Pastikan `JAM_MASUK`, `JAM_PULANG`, `TOLERANSI_MENIT` di backend (Code.gs) sama dengan frontend (index.html)!**

---

## ✅ LANGKAH 6 — Testing

| Test | Cara |
|---|---|
| **Login** | Login dengan akun karyawan biasa |
| **Selfie** | Klik Check-In → harus muncul kamera selfie |
| **Geofence** | Lihat badge di atas, harus tampilkan jarak dari kantor |
| **Status Cerdas** | Check-In → cek di status card "Tepat Waktu" / "Telat" |
| **Riwayat** | Tab Riwayat → muncul kalender bulanan dengan warna |
| **Izin** | Tab Izin/Cuti → submit pengajuan, lalu login admin → approve |
| **Dark Mode** | Klik toggle di kanan atas → tema berubah |
| **Modal** | Klik logout → muncul modal konfirmasi (bukan native confirm) |

---

## 🐛 Troubleshooting

### "Sheet Izin tidak ditemukan"
Anda belum buat sheet bernama `Izin`. Lihat **LANGKAH 1B**.

### "Selfie tidak tersimpan"
- Cek `SELFIE_FOLDER_ID` sudah diisi di `Code.gs`.
- Saat re-deploy, harus authorize ulang permission Drive.

### "Action tidak dikenali"
- Anda mungkin lupa **New Deployment** setelah edit kode.
- Buat new deployment, copy URL baru, update di `index.html`.

### "Latitude/Longitude kosong di sheet"
- User menolak akses GPS browser.
- Pastikan situs di-akses lewat HTTPS (GAS Web App default HTTPS).

### "Status selalu 'Telat'"
- `JAM_MASUK` di `Code.gs` dan `index.html` harus sama persis.
- Cek timezone server (GAS) sudah `Asia/Jakarta`.

---

## 📞 Support

Jika ada masalah saat upgrade, cek:
1. Browser DevTools → Network tab → request ke GAS_URL berhasil?
2. GAS Editor → Executions → ada error log?
3. Sheet "Absensi" dan "Izin" punya header sesuai panduan?

---

**Selamat menggunakan Absensi FSR v2.0! 🎉**
