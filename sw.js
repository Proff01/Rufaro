const CACHE_NAME = 'rufaro-diet-v1';
const ASSETS = ['/'];

// ── INSTALL: cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// ── ACTIVATE: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── FETCH: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});

// ── PUSH: handle incoming push messages
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || "Rufaro's Diet Reminder 🌿";
  const options = {
    body: data.body || 'Time for your next meal!',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'diet-reminder',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK: open the app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('/');
    })
  );
});

// ── SCHEDULED ALARMS via postMessage
// The page sends alarm times; the SW stores them and fires notifications at the right time
let alarmTimers = [];

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SET_ALARMS') {
    scheduleAlarms(e.data.alarms, e.data.currentDay);
  }
  if (e.data && e.data.type === 'CLEAR_ALARMS') {
    clearAlarms();
  }
});

function clearAlarms() {
  alarmTimers.forEach(t => clearTimeout(t));
  alarmTimers = [];
}

function scheduleAlarms(alarms, currentDay) {
  clearAlarms();
  const now = Date.now();

  alarms.forEach(alarm => {
    if (!alarm.enabled) return;
    const [h, m] = alarm.time.split(':').map(Number);
    let target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= now) {
      target.setDate(target.getDate() + 1);
    }
    const delay = target.getTime() - now;

    const t = setTimeout(() => {
      self.registration.showNotification(`${alarm.emoji} ${alarm.label} — Day ${currentDay}`, {
        body: alarm.body || 'Time for your next meal! 🌿',
        tag: 'diet-' + alarm.key,
        renotify: true,
        icon: '/icon-192.png',
      });
      // Reschedule for next day
      const daily = setInterval(() => {
        // Get current day from clients
        clients.matchAll().then(list => {
          list.forEach(c => c.postMessage({ type: 'GET_DAY' }));
        });
        self.registration.showNotification(`${alarm.emoji} ${alarm.label}`, {
          body: alarm.body || 'Time for your next meal! 🌿',
          tag: 'diet-' + alarm.key,
          renotify: true,
          icon: '/icon-192.png',
        });
      }, 86400000);
      alarmTimers.push(daily);
    }, delay);

    alarmTimers.push(t);
  });
}
