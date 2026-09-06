/**
 * Absensi FSR — Auto-Update Manager
 * Mendeteksi versi aplikasi baru dan menampilkan notifikasi update
 */

class AutoUpdateManager {
  constructor() {
    this.updateCheckInterval = 60000; // Cek update setiap 1 menit
    this.hasNewVersion = false;
    this.init();
  }

  /**
   * Inisialisasi Auto-Update Manager
   */
  async init() {
    // Cek update saat aplikasi pertama kali dibuka
    await this.checkForUpdates();

    // Lalu cek update secara berkala
    setInterval(() => {
      this.checkForUpdates();
    }, this.updateCheckInterval);

    // Listen untuk update dari Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('✅ Service Worker updated - Controller changed');
      });

      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          console.log('🔄 Update ditemukan, installing...');
          
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              console.log('✅ Update siap! Notifikasi akan ditampilkan');
              this.hasNewVersion = true;
              this.showUpdateNotification();
            }
          });
        });
      });
    }
  }

  /**
   * Cek update dengan membandingkan file index.html
   */
  async checkForUpdates() {
    try {
      const response = await fetch('./index.html?v=' + Date.now(), {
        cache: 'no-store',
        method: 'HEAD'
      });

      if (response.ok) {
        const lastModified = response.headers.get('last-modified');
        const cachedLastModified = localStorage.getItem('app_last_modified');
        
        if (cachedLastModified && lastModified !== cachedLastModified) {
          console.log('📦 Versi baru aplikasi terdeteksi!');
          this.hasNewVersion = true;
          localStorage.setItem('app_last_modified', lastModified);
          
          // Trigger Service Worker update
          if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.controller.postMessage({
              type: 'CHECK_UPDATE'
            });
          }
        } else if (!cachedLastModified) {
          localStorage.setItem('app_last_modified', lastModified);
        }
      }
    } catch (err) {
      console.warn('Failed to check for updates:', err);
    }
  }

  /**
   * Tampilkan notifikasi update
   */
  showUpdateNotification() {
    const updateNotif = document.getElementById('update-notification');
    
    if (updateNotif) {
      updateNotif.style.display = 'flex';
      
      // Auto-hide setelah 10 detik
      setTimeout(() => {
        if (updateNotif.style.display === 'flex') {
          updateNotif.style.opacity = '0';
          setTimeout(() => {
            updateNotif.style.display = 'none';
            updateNotif.style.opacity = '1';
          }, 300);
        }
      }, 10000);
    }
  }

  /**
   * Reload aplikasi untuk versi terbaru
   */
  reloadApp() {
    // Hapus cache lama
    if ('caches' in window) {
      caches.keys().then((cacheNames) => {
        cacheNames.forEach((cacheName) => {
          caches.delete(cacheName);
        });
      });
    }

    // Kirim pesan ke Service Worker untuk skip waiting
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SKIP_WAITING'
      });
    }

    // Reload setelah 1 detik
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }

  /**
   * Tutup notifikasi update
   */
  closeUpdateNotification() {
    const updateNotif = document.getElementById('update-notification');
    if (updateNotif) {
      updateNotif.style.opacity = '0';
      setTimeout(() => {
        updateNotif.style.display = 'none';
        updateNotif.style.opacity = '1';
      }, 300);
    }
  }
}

// Initialize global instance
const autoUpdateManager = new AutoUpdateManager();
