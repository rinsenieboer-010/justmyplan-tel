import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { pad } from './utils';

// Meldingen ook tonen als de app op de voorgrond staat
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermissions() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: asked } = await Notifications.requestPermissionsAsync();
  return asked === 'granted';
}

// iOS staat max 64 geplande lokale meldingen toe; houd marge aan
const MAX_SCHEDULED = 60;

const EVENT_LEAD_MINUTES = 15; // melding X minuten vóór een afspraak

function parseReminderTime(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  if (!m) return null;
  const hour = Number(m[1]), minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

// Weekdag voor WEEKLY-trigger: 1 = zondag ... 7 = zaterdag (iOS-conventie)
function weekdayOf(dateStr) {
  return new Date(dateStr + 'T12:00:00').getDay() + 1;
}

// Plan alle meldingen opnieuw op basis van de huidige taken en afspraken.
// Eigen data only: gedeelde taken/afspraken zijn de verantwoordelijkheid
// van de eigenaar.
export async function syncNotifications(tasks, events) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') return;

    await Notifications.cancelAllScheduledNotificationsAsync();
    const now = new Date();
    let scheduled = 0;

    const schedule = async (content, trigger) => {
      if (scheduled >= MAX_SCHEDULED) return;
      await Notifications.scheduleNotificationAsync({ content, trigger });
      scheduled++;
    };

    // ── Taken met een herinneringstijd ──
    for (const task of tasks) {
      if (task.isShared || !task.reminderTime) continue;
      const time = parseReminderTime(task.reminderTime);
      if (!time) continue;

      const content = {
        title: task.title,
        body: 'Herinnering — vink af als het gelukt is ✓',
        sound: true,
      };

      if (task.recurrence === 'daily') {
        await schedule(content, {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: time.hour, minute: time.minute,
        });
      } else if (task.recurrence === 'weekly' && task.deadline) {
        await schedule(content, {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: weekdayOf(task.deadline),
          hour: time.hour, minute: time.minute,
        });
      } else if (task.deadline) {
        // Eenmalig (of andere herhaling: volgende deadline; bij afvinken
        // schuift de deadline op en plannen we opnieuw)
        const fire = new Date(task.deadline + 'T' + pad(time.hour) + ':' + pad(time.minute) + ':00');
        if (fire > now) {
          await schedule(content, {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fire,
          });
        }
      }
    }

    // ── Afspraken: melding vooraf ──
    const upcoming = events
      .filter(e => e.date && !e.isShared)
      .map(e => {
        const start = new Date(e.date + 'T' + pad(e.startH) + ':' + pad(e.startM) + ':00');
        return { e, start, fire: new Date(start.getTime() - EVENT_LEAD_MINUTES * 60 * 1000) };
      })
      .filter(({ fire }) => fire > now)
      .sort((a, b) => a.fire - b.fire);

    for (const { e, start, fire } of upcoming) {
      await schedule(
        {
          title: e.title,
          body: 'Begint om ' + pad(e.startH) + ':' + pad(e.startM) + ' (over ' + EVENT_LEAD_MINUTES + ' min)',
          sound: true,
        },
        { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fire }
      );
    }
  } catch (err) {
    // Meldingen zijn nice-to-have: nooit de app laten crashen op plannen
    console.log('syncNotifications faalde:', err?.message);
  }
}
