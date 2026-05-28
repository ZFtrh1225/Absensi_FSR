/**
 * ============================================================
 *  ABSENSI FSR — Google Apps Script Backend (REST API)
 *  Version : 2.0.0 — Priority 1 + Dark Mode + Custom Modal Edition
 * ============================================================
 *
 *  WHAT'S NEW IN v2.0
 *  ─────────────────────────────────────────────────────────
 *  - submitAbsensi: now stores Selfie URL (saved to Drive),
 *    in-radius flag, distance from office, smart status
 *    (Tepat Waktu / Telat / Lembur).
 *  - NEW: getMyTodayStatus  — return today's check-in/out per user
 *  - NEW: getMyMonthly      — monthly attendance map for calendar
 *  - NEW: submitIzin        — submit izin/sakit/cuti/wfh request
 *  - NEW: getMyIzin         — user's own izin history
 *  - NEW: getAllIzin        — all izin requests (admin)
 *  - NEW: updateIzinStatus  — approve/reject izin (admin)
 *
 *  SETUP INSTRUCTIONS
 *  ─────────────────────────────────────────────────────────
 *  1. Open your Google Spreadsheet.
 *  2. Make sure these sheets exist (create if missing):
 *
 *     Sheet "Users"
 *       Headers (Row 1):
 *       ID_Karyawan | Nama | PIN | Role
 *
 *     Sheet "Absensi"  ◄── ADD 4 NEW COLUMNS!
 *       Headers (Row 1):
 *       Timestamp | ID_Karyawan | Nama | Tipe_Absen |
 *       Latitude | Longitude | Link_Google_Maps |
 *       Selfie_URL | In_Radius | Distance_M | Status
 *
 *     Sheet "Izin"  ◄── CREATE NEW SHEET!
 *       Headers (Row 1):
 *       Timestamp | ID_Karyawan | Nama | Tipe | Dari | Sampai |
 *       Alasan | Status | Approved_By | Approved_At
 *
 *  3. Create a Google Drive FOLDER for selfies, copy its ID
 *     from the URL: https://drive.google.com/drive/folders/<<FOLDER_ID>>
 *
 *  4. Paste IDs below in CONFIG section.
 *
 *  5. Deploy → New Deployment → Web App
 *       Execute as       : Me
 *       Who can access   : Anyone
 *
 *  6. Authorize permissions (Drive + Spreadsheet), copy URL,
 *     paste into index.html as GAS_URL.
 *
 *  IMPORTANT — when re-deploying after editing this script,
 *  always create a NEW DEPLOYMENT (not "Manage deployments")
 *  so the latest code becomes active.
 * ============================================================
 */

// ════════════════════════════════════════════════════════════
//  CONFIG — EDIT THESE VALUES
// ════════════════════════════════════════════════════════════

const SPREADSHEET_ID    = '147vlK6BxUrEOYqD27MedD0avqqjI8Ed3mMA1Z95U3VI';
const SELFIE_FOLDER_ID  = '1xpYzOx6t4mqHNlkvtfM6xb33KfvF7qSR';   // <── PASTE Google Drive Folder ID here for selfie storage
const TZ                = 'Asia/Jakarta';

// Smart-status thresholds (kept identical to frontend)
const JAM_MASUK_HHMM    = '08:15';
const JAM_PULANG_HHMM   = '17:00';
const TOLERANSI_MENIT   = 45;

// ════════════════════════════════════════════════════════════
//  ENTRY POINTS
// ════════════════════════════════════════════════════════════

function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

// ════════════════════════════════════════════════════════════
//  MAIN ROUTER
// ════════════════════════════════════════════════════════════

function handleRequest(e) {
  try {
    let params = {};

    if (e.postData && e.postData.contents) {
      try { params = JSON.parse(e.postData.contents); } catch (_) {}
    }

    if (e.parameter && e.parameter.data) {
      try {
        const decoded = JSON.parse(decodeURIComponent(e.parameter.data));
        params = Object.assign(params, decoded);
      } catch (_) {}
    }

    if (e.parameter) {
      Object.keys(e.parameter).forEach(function (k) {
        if (k !== 'data' && !params[k]) params[k] = e.parameter[k];
      });
    }

    const action = params.action || '';

    switch (action) {
      // v1 actions
      case 'login':            return respond(handleLogin(params));
      case 'submitAbsensi':    return respond(handleSubmitAbsensi(params));
      case 'getUsers':         return respond(handleGetUsers(params));
      case 'updateUserRole':   return respond(handleUpdateUserRole(params));
      case 'getTodayAbsensi':  return respond(handleGetTodayAbsensi(params));

      // v2 NEW actions
      case 'getMyTodayStatus': return respond(handleGetMyTodayStatus(params));
      case 'getMyMonthly':     return respond(handleGetMyMonthly(params));
      case 'submitIzin':       return respond(handleSubmitIzin(params));
      case 'getMyIzin':        return respond(handleGetMyIzin(params));
      case 'getAllIzin':       return respond(handleGetAllIzin(params));
      case 'updateIzinStatus': return respond(handleUpdateIzinStatus(params));

      case 'ping':             return respond({ success: true, message: 'pong', serverTime: nowWIB(), version: '2.0.0' });
      default:
        return respond({ success: false, message: 'Action tidak dikenali: "' + action + '"' });
    }
  } catch (err) {
    return respond({ success: false, message: 'Server error: ' + err.message });
  }
}

// ════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan. Pastikan nama sheet sudah benar.');
  return sheet;
}

function todayWIB() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
}

function nowWIB() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss');
}

function str(val) {
  return String(val == null ? '' : val).trim();
}

/**
 * Compute attendance status:
 * "Tepat Waktu" | "Telat <N> menit" | "Lembur <H>j <M>m"
 * Returns string. Pass "HH:mm:ss" (or HH:mm) strings or empty.
 */
function computeStatus(checkinTime, checkoutTime) {
  if (!checkinTime) return '';
  var parts = checkinTime.split(':');
  var ciMin = (+parts[0]) * 60 + (+parts[1]);

  var jm = JAM_MASUK_HHMM.split(':');
  var jp = JAM_PULANG_HHMM.split(':');
  var batasMasuk  = (+jm[0]) * 60 + (+jm[1]);
  var batasPulang = (+jp[0]) * 60 + (+jp[1]);
  var batasTelat  = batasMasuk + TOLERANSI_MENIT;

  var status = 'Tepat Waktu';
  if (ciMin > batasTelat) {
    status = 'Telat ' + (ciMin - batasMasuk) + ' menit';
  }

  if (checkoutTime) {
    var partsCo = checkoutTime.split(':');
    var coMin = (+partsCo[0]) * 60 + (+partsCo[1]);
    if (coMin > batasPulang + 30) {
      var lembur = coMin - batasPulang;
      var jam    = Math.floor(lembur / 60);
      var menit  = lembur % 60;
      status = jam > 0 ? ('Lembur ' + jam + 'j ' + menit + 'm')
                       : ('Lembur ' + menit + 'm');
    }
  }

  return status;
}

/**
 * Save base64 selfie to Drive, return shareable URL.
 * Skip silently if SELFIE_FOLDER_ID not configured.
 */
function saveSelfieToDrive(base64DataUrl, idKaryawan, tipe) {
  if (!SELFIE_FOLDER_ID || !base64DataUrl) return '';

  try {
    // Strip data:image/jpeg;base64, prefix
    var match = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) return '';

    var mimeType = match[1];
    var base64   = match[2];
    var bytes    = Utilities.base64Decode(base64);
    var blob     = Utilities.newBlob(bytes, mimeType,
      idKaryawan + '_' + tipe.replace('-', '') + '_' + nowWIB().replace(/[: ]/g, '-') + '.jpg');

    var folder = DriveApp.getFolderById(SELFIE_FOLDER_ID);
    var file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch (err) {
    console.error('Selfie save failed:', err);
    return '';
  }
}

// ════════════════════════════════════════════════════════════
//  HANDLER: LOGIN
// ════════════════════════════════════════════════════════════

function handleLogin(params) {
  const id  = str(params.id_karyawan);
  const pin = str(params.pin);

  if (!id || !pin) {
    return { success: false, message: 'ID Karyawan dan PIN wajib diisi.' };
  }

  const data = getSheet('Users').getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0]) continue;

    if (str(row[0]) === id && str(row[2]) === pin) {
      return {
        success: true,
        user: {
          id_karyawan : str(row[0]),
          nama        : str(row[1]),
          role        : str(row[3])
        }
      };
    }
  }

  return { success: false, message: 'ID Karyawan atau PIN tidak valid. Silakan coba lagi.' };
}

// ════════════════════════════════════════════════════════════
//  HANDLER: SUBMIT ABSENSI (v2 — selfie + geofence + status)
//  Params: { action, id_karyawan, nama, tipe_absen,
//            latitude?, longitude?, selfie?, in_radius?, distance? }
// ════════════════════════════════════════════════════════════

function handleSubmitAbsensi(params) {
  var id        = str(params.id_karyawan);
  var nama      = str(params.nama);
  var tipe      = str(params.tipe_absen);
  var latitude  = str(params.latitude);
  var longitude = str(params.longitude);
  var selfie    = str(params.selfie);
  var inRadius  = params.in_radius === true || params.in_radius === 'true' ? 'YA'
                : (params.in_radius === false || params.in_radius === 'false') ? 'TIDAK' : '';
  var distance  = params.distance != null ? str(params.distance) : '';

  if (!id || !nama || !tipe) {
    return { success: false, message: 'Data absensi tidak lengkap.' };
  }
  if (tipe !== 'Check-In' && tipe !== 'Check-Out') {
    return { success: false, message: 'Tipe absen tidak valid.' };
  }

  var sheet = getSheet('Absensi');
  var today = todayWIB();
  var data  = sheet.getDataRange().getValues();

  // Duplicate guard + collect today's existing checkin/out time
  var existingCheckin  = '';
  var existingCheckout = '';
  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var rowTs   = str(data[i][0]).substring(0, 10);
    var rowId   = str(data[i][1]);
    var rowTipe = str(data[i][3]);
    if (rowTs !== today || rowId !== id) continue;

    if (rowTipe === 'Check-In')  existingCheckin  = str(data[i][0]).substring(11, 19);
    if (rowTipe === 'Check-Out') existingCheckout = str(data[i][0]).substring(11, 19);

    if (rowTipe === tipe) {
      return {
        success: false,
        message: 'Anda sudah melakukan ' + tipe + ' hari ini pukul ' + str(data[i][0]).substring(11, 19) + ' WIB.'
      };
    }
  }

  // Save selfie to Drive (if configured)
  var selfieUrl = saveSelfieToDrive(selfie, id, tipe);

  var now      = nowWIB();
  var timeOnly = now.substring(11, 19);
  var link     = (latitude && longitude)
    ? 'https://www.google.com/maps?q=' + latitude + ',' + longitude
    : '';

  // Compute smart status
  var statusStr = '';
  if (tipe === 'Check-In') {
    statusStr = computeStatus(timeOnly, '');
  } else {
    // For Check-Out, recompute combined status using the existing check-in time
    statusStr = computeStatus(existingCheckin, timeOnly);
  }

  sheet.appendRow([
    now, id, nama, tipe,
    latitude, longitude, link,
    selfieUrl, inRadius, distance, statusStr
  ]);

  return {
    success   : true,
    message   : tipe + ' berhasil dicatat. ' + (statusStr ? '(' + statusStr + ')' : ''),
    timestamp : now,
    status    : statusStr
  };
}

// ════════════════════════════════════════════════════════════
//  HANDLER: GET ALL USERS
// ════════════════════════════════════════════════════════════

function handleGetUsers(params) {
  var data  = getSheet('Users').getDataRange().getValues();
  var users = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    users.push({
      id_karyawan : str(data[i][0]),
      nama        : str(data[i][1]),
      role        : str(data[i][3])
    });
  }
  return { success: true, users: users };
}

// ════════════════════════════════════════════════════════════
//  HANDLER: UPDATE USER ROLE
// ════════════════════════════════════════════════════════════

function handleUpdateUserRole(params) {
  var id       = str(params.id_karyawan);
  var newRole  = str(params.new_role);

  if (!id || !newRole) {
    return { success: false, message: 'Parameter id_karyawan dan new_role wajib diisi.' };
  }
  if (newRole !== 'Admin' && newRole !== 'Karyawan') {
    return { success: false, message: 'Role tidak valid.' };
  }

  var sheet = getSheet('Users');
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (str(data[i][0]) === id) {
      sheet.getRange(i + 1, 4).setValue(newRole);
      return {
        success : true,
        message : 'Role ' + id + ' berhasil diubah menjadi "' + newRole + '".'
      };
    }
  }
  return { success: false, message: 'Karyawan dengan ID "' + id + '" tidak ditemukan.' };
}

// ════════════════════════════════════════════════════════════
//  HANDLER: GET TODAY'S ATTENDANCE (admin)
//  Now also returns in_radius, distance, status, selfie URL.
// ════════════════════════════════════════════════════════════

function handleGetTodayAbsensi(params) {
  var sheet   = getSheet('Absensi');
  var today   = todayWIB();
  var data    = sheet.getDataRange().getValues();
  var records = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var rowDate = str(data[i][0]).substring(0, 10);
    if (rowDate !== today) continue;

    records.push({
      timestamp   : str(data[i][0]),
      id_karyawan : str(data[i][1]),
      nama        : str(data[i][2]),
      tipe_absen  : str(data[i][3]),
      latitude    : str(data[i][4]),
      longitude   : str(data[i][5]),
      link_maps   : str(data[i][6]),
      selfie_url  : str(data[i][7]),
      in_radius   : str(data[i][8]) === 'YA' ? true : (str(data[i][8]) === 'TIDAK' ? false : null),
      distance    : str(data[i][9]),
      status      : str(data[i][10])
    });
  }

  records.sort(function (a, b) { return b.timestamp.localeCompare(a.timestamp); });
  return { success: true, records: records, today: today };
}

// ════════════════════════════════════════════════════════════
//  v2 NEW HANDLER: GET MY TODAY STATUS
//  Params: { action, id_karyawan }
//  Returns: { success, checkin: "HH:MM:SS"|null, checkout: "HH:MM:SS"|null }
// ════════════════════════════════════════════════════════════

function handleGetMyTodayStatus(params) {
  var id = str(params.id_karyawan);
  if (!id) return { success: false, message: 'ID Karyawan wajib diisi.' };

  var sheet = getSheet('Absensi');
  var today = todayWIB();
  var data  = sheet.getDataRange().getValues();

  var checkin  = null;
  var checkout = null;

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    var rowDate = str(data[i][0]).substring(0, 10);
    var rowId   = str(data[i][1]);
    var rowTipe = str(data[i][3]);
    if (rowDate !== today || rowId !== id) continue;

    var t = str(data[i][0]).substring(11, 19);
    if (rowTipe === 'Check-In')  checkin  = t;
    if (rowTipe === 'Check-Out') checkout = t;
  }

  return { success: true, checkin: checkin, checkout: checkout, today: today };
}

// ════════════════════════════════════════════════════════════
//  v2 NEW HANDLER: GET MY MONTHLY ATTENDANCE
//  Params: { action, id_karyawan, year, month }  (month: 1-12)
//  Returns: { success, records: { "yyyy-MM-dd": {status: "hadir"|"telat"|"izin"|"cuti"|"sakit"|"wfh"} } }
// ════════════════════════════════════════════════════════════

function handleGetMyMonthly(params) {
  var id    = str(params.id_karyawan);
  var year  = parseInt(params.year, 10);
  var month = parseInt(params.month, 10);

  if (!id || !year || !month) {
    return { success: false, message: 'Parameter id_karyawan, year, dan month wajib diisi.' };
  }

  var monthStr = String(month).padStart(2, '0');
  var prefix   = year + '-' + monthStr;
  var records  = {};

  // 1. From Absensi sheet (mark days with check-in)
  var absensi = getSheet('Absensi').getDataRange().getValues();
  for (var i = 1; i < absensi.length; i++) {
    if (!absensi[i][0]) continue;
    var rowDate = str(absensi[i][0]).substring(0, 10);
    var rowId   = str(absensi[i][1]);
    var rowTipe = str(absensi[i][3]);
    var rowStat = str(absensi[i][10]); // Status column

    if (rowId !== id || rowDate.substring(0, 7) !== prefix) continue;
    if (rowTipe !== 'Check-In') continue;

    var status = 'hadir';
    if (rowStat && rowStat.indexOf('Telat') === 0) status = 'telat';
    records[rowDate] = { status: status, time: str(absensi[i][0]).substring(11, 19) };
  }

  // 2. From Izin sheet (mark days with approved leave)
  try {
    var izinData = getSheet('Izin').getDataRange().getValues();
    for (var j = 1; j < izinData.length; j++) {
      if (!izinData[j][0]) continue;
      var izinId    = str(izinData[j][1]);
      var izinTipe  = str(izinData[j][3]).toLowerCase();
      var dari      = str(izinData[j][4]);
      var sampai    = str(izinData[j][5]);
      var status    = str(izinData[j][7]);

      if (izinId !== id) continue;
      if (status !== 'Approved') continue;

      // Loop through date range
      var startDate = new Date(dari + 'T00:00:00');
      var endDate   = new Date(sampai + 'T00:00:00');
      var cur = new Date(startDate);
      while (cur <= endDate) {
        var dStr = Utilities.formatDate(cur, TZ, 'yyyy-MM-dd');
        if (dStr.substring(0, 7) === prefix) {
          if (!records[dStr]) {
            records[dStr] = { status: izinTipe || 'izin' };
          }
        }
        cur.setDate(cur.getDate() + 1);
      }
    }
  } catch (e) { /* Izin sheet may not exist yet */ }

  return { success: true, records: records, year: year, month: month };
}

// ════════════════════════════════════════════════════════════
//  v2 NEW HANDLER: SUBMIT IZIN
//  Params: { action, id_karyawan, nama, tipe, dari, sampai, alasan }
// ════════════════════════════════════════════════════════════

function handleSubmitIzin(params) {
  var id     = str(params.id_karyawan);
  var nama   = str(params.nama);
  var tipe   = str(params.tipe);
  var dari   = str(params.dari);
  var sampai = str(params.sampai);
  var alasan = str(params.alasan);

  if (!id || !nama || !tipe || !dari || !sampai || !alasan) {
    return { success: false, message: 'Semua field wajib diisi.' };
  }

  var validTipe = ['Izin', 'Sakit', 'Cuti', 'WFH'];
  if (validTipe.indexOf(tipe) === -1) {
    return { success: false, message: 'Tipe pengajuan tidak valid.' };
  }

  var sheet = getSheet('Izin');
  sheet.appendRow([
    nowWIB(), id, nama, tipe, dari, sampai, alasan,
    'Pending', '', ''
  ]);

  return { success: true, message: 'Pengajuan ' + tipe + ' berhasil dikirim. Menunggu persetujuan admin.' };
}

// ════════════════════════════════════════════════════════════
//  v2 NEW HANDLER: GET MY IZIN HISTORY
//  Params: { action, id_karyawan }
// ════════════════════════════════════════════════════════════

function handleGetMyIzin(params) {
  var id = str(params.id_karyawan);
  if (!id) return { success: false, message: 'ID Karyawan wajib diisi.' };

  var sheet   = getSheet('Izin');
  var data    = sheet.getDataRange().getValues();
  var records = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    if (str(data[i][1]) !== id) continue;

    records.push({
      timestamp   : str(data[i][0]),
      id_karyawan : str(data[i][1]),
      nama        : str(data[i][2]),
      tipe        : str(data[i][3]),
      dari        : str(data[i][4]),
      sampai      : str(data[i][5]),
      alasan      : str(data[i][6]),
      status      : str(data[i][7]) || 'Pending'
    });
  }

  records.sort(function (a, b) { return b.timestamp.localeCompare(a.timestamp); });
  return { success: true, records: records };
}

// ════════════════════════════════════════════════════════════
//  v2 NEW HANDLER: GET ALL IZIN (admin)
// ════════════════════════════════════════════════════════════

function handleGetAllIzin(params) {
  var sheet   = getSheet('Izin');
  var data    = sheet.getDataRange().getValues();
  var records = [];

  for (var i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    records.push({
      timestamp   : str(data[i][0]),
      id_karyawan : str(data[i][1]),
      nama        : str(data[i][2]),
      tipe        : str(data[i][3]),
      dari        : str(data[i][4]),
      sampai      : str(data[i][5]),
      alasan      : str(data[i][6]),
      status      : str(data[i][7]) || 'Pending',
      approved_by : str(data[i][8]),
      approved_at : str(data[i][9])
    });
  }

  // Sort: Pending first, then by newest
  records.sort(function (a, b) {
    if (a.status === 'Pending' && b.status !== 'Pending') return -1;
    if (b.status === 'Pending' && a.status !== 'Pending') return 1;
    return b.timestamp.localeCompare(a.timestamp);
  });

  return { success: true, records: records };
}

// ════════════════════════════════════════════════════════════
//  v2 NEW HANDLER: UPDATE IZIN STATUS (admin)
//  Params: { action, id_karyawan, dari, sampai, new_status, approved_by? }
// ════════════════════════════════════════════════════════════

function handleUpdateIzinStatus(params) {
  var id        = str(params.id_karyawan);
  var dari      = str(params.dari);
  var sampai    = str(params.sampai);
  var newStatus = str(params.new_status);
  var approver  = str(params.approved_by);

  if (!id || !dari || !sampai || !newStatus) {
    return { success: false, message: 'Parameter tidak lengkap.' };
  }
  if (newStatus !== 'Approved' && newStatus !== 'Rejected') {
    return { success: false, message: 'Status tidak valid.' };
  }

  var sheet = getSheet('Izin');
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (str(data[i][1]) === id && str(data[i][4]) === dari && str(data[i][5]) === sampai) {
      sheet.getRange(i + 1, 8).setValue(newStatus);            // Column H: Status
      sheet.getRange(i + 1, 9).setValue(approver || 'Admin');  // Column I: Approved_By
      sheet.getRange(i + 1, 10).setValue(nowWIB());            // Column J: Approved_At
      return {
        success : true,
        message : 'Pengajuan berhasil ' + (newStatus === 'Approved' ? 'disetujui' : 'ditolak') + '.'
      };
    }
  }

  return { success: false, message: 'Pengajuan tidak ditemukan.' };
}
