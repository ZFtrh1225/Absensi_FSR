/**
 * Absensi FSR — Notification Manager
 * Mengelola notifikasi reminder untuk absensi masuk & pulang
 * Menggunakan Service Worker untuk notifikasi background
 */

class NotificationManager {
  constructor() {
    this.checkInTime = '07:00'; // Jam absensi masuk default
    this.checkOutTime = '16:00'; // Jam absensi pulang default
    this.reminderBefore = 5; // Reminder X menit sebelum waktu absensi
    this.enabled = true;
    this.notificationSchedules = new Map();
    this.init();
  }

  /**
   * Inisialisasi Notification Manager
   */
  async init() {
    // Load pengaturan dari localStorage
    this.loadSettings();

    // Request permission notifikasi
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        console.log('Notification permission:', permission);
      } catch (err) {
        console.error('Failed to request notification permission:', err);
      }
    }

    // Daftarkan Service Worker jika belum
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js');
        console.log('Service Worker registered for notifications:', reg);
      } catch (err) {
        console.error('Service Worker registration failed:', err);
      }
    }

    // Start scheduler
    this.startScheduler();
  }

  /**
   * Load pengaturan dari localStorage
   */
  loadSettings() {
    const settings = localStorage.getItem('absensi_notification_settings');
    if (settings) {
      const parsed = JSON.parse(settings);
      this.checkInTime = parsed.checkInTime || this.checkInTime;
      this.checkOutTime = parsed.checkOutTime || this.checkOutTime;
      this.reminderBefore = parsed.reminderBefore || this.reminderBefore;
      this.enabled = parsed.enabled !== false;
    }
  }

  /**
   * Simpan pengaturan ke localStorage
   */
  saveSettings() {
    const settings = {
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      reminderBefore: this.reminderBefore,
      enabled: this.enabled
    };
    localStorage.setItem('absensi_notification_settings', JSON.stringify(settings));
  }

  /**
   * Update pengaturan notifikasi
   */
  updateSettings(checkInTime, checkOutTime, reminderBefore = 5) {
    this.checkInTime = checkInTime || this.checkInTime;
    this.checkOutTime = checkOutTime || this.checkOutTime;
    this.reminderBefore = reminderBefore;
    this.saveSettings();
    
    // Restart scheduler dengan pengaturan baru
    this.clearScheduler();
    this.startScheduler();
  }

  /**
   * Start scheduler — cek waktu setiap menit
   */
  startScheduler() {
    if (!this.enabled) return;

    // Cek notifikasi setiap 30 detik (untuk akurasi)
    this.schedulerInterval = setInterval(() => {
      this.checkNotificationTime();
    }, 30000); // 30 detik

    // Cek langsung saat pertama kali
    this.checkNotificationTime();
  }

  /**
   * Clear scheduler
   */
  clearScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  /**
   * Cek apakah sudah waktunya menampilkan notifikasi
   */
  checkNotificationTime() {
    if (!this.enabled || Notification.permission !== 'granted') return;

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    // Cek notifikasi masuk
    const checkInTime = this.getTimeMinusBefore(this.checkInTime, this.reminderBefore);
    if (currentTime === checkInTime && !this.notificationSchedules.get('checkin-reminder')) {
      this.showNotification(
        '⏰ Saatnya Absensi Masuk!',
        `Jam absensi masuk dimulai pukul ${this.checkInTime}. Segera lakukan absensi.`,
        'checkin-reminder'
      );
      this.notificationSchedules.set('checkin-reminder', true);
      // Reset flag setelah 1 menit
      setTimeout(() => this.notificationSchedules.delete('checkin-reminder'), 60000);
    }

    // Cek notifikasi checkout
    const checkOutTime = this.getTimeMinusBefore(this.checkOutTime, this.reminderBefore);
    if (currentTime === checkOutTime && !this.notificationSchedules.get('checkout-reminder')) {
      this.showNotification(
        '⏰ Saatnya Absensi Pulang!',
        `Jam absensi pulang dimulai pukul ${this.checkOutTime}. Jangan lupa absensi pulang.`,
        'checkout-reminder'
      );
      this.notificationSchedules.set('checkout-reminder', true);
      // Reset flag setelah 1 menit
      setTimeout(() => this.notificationSchedules.delete('checkout-reminder'), 60000);
    }
  }

  /**
   * Hitung waktu dikurangi X menit
   */
  getTimeMinusBefore(timeStr, minutesBefore) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    let totalMinutes = hours * 60 + minutes - minutesBefore;
    
    if (totalMinutes < 0) {
      totalMinutes += 24 * 60; // Wrap ke hari sebelumnya
    }
    
    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMinutes = totalMinutes % 60;
    
    return `${String(newHours).padStart(2, '0')}:${String(newMinutes).padStart(2, '0')}`;
  }

  /**
   * Tampilkan notifikasi
   */
  async showNotification(title, body, tag = 'absensi-notification') {
    try {
      // Gunakan Service Worker untuk notifikasi yang lebih reliable
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          payload: {
            title: title,
            body: body,
            tag: tag,
            icon: 'https://api.iconify.design/material-symbols:fingerprint.svg?color=%236366f1',
            badge: 'https://api.iconify.design/material-symbols:notifications-active.svg?color=%236366f1',
            actions: [
              { action: 'open', title: 'Buka Aplikasi' },
              { action: 'dismiss', title: 'Tutup' }
            ]
          }
        });
      } else if ('Notification' in window) {
        // Fallback ke Notification API biasa
        new Notification(title, {
          body: body,
          tag: tag,
          icon: 'https://api.iconify.design/material-symbols:fingerprint.svg?color=%236366f1',
          badge: 'https://api.iconify.design/material-symbols:notifications-active.svg?color=%236366f1',
          requireInteraction: false
        });
      }

      // Log notifikasi
      console.log(`[Notifikasi] ${title}: ${body}`);
    } catch (err) {
      console.error('Failed to show notification:', err);
    }
  }

  /**
   * Toggle notifikasi on/off
   */
  toggleNotifications(enabled) {
    this.enabled = enabled;
    this.saveSettings();
    
    if (enabled) {
      this.startScheduler();
    } else {
      this.clearScheduler();
    }
  }

  /**
   * Enable notifikasi
   */
  enable() {
    this.toggleNotifications(true);
  }

  /**
   * Disable notifikasi
   */
  disable() {
    this.toggleNotifications(false);
  }

  /**
   * Get pengaturan saat ini
   */
  getSettings() {
    return {
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      reminderBefore: this.reminderBefore,
      enabled: this.enabled
    };
  }
}

// Initialize global instance
const notificationManager = new NotificationManager();
