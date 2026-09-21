// ── AGENDA-TERUGSYNC ──────────────────────────────────────────────────────────
// Schrijft justmyplan-afspraken terug naar de agenda op de telefoon. Omdat iOS
// een gekoppeld Google-account net zo behandelt als iCloud, dekt dit Apple én
// Google Agenda in één keer: alles wat hier landt, synct het besturingssysteem
// zelf door naar de cloud.
//
// Waarom de koppeling lokaal staat en niet in Supabase: een event-id van
// EventKit geldt alleen op dit toestel. Zou je hem in de database zetten, dan
// wijst hij op een tweede telefoon naar niets, of erger, naar een andere
// afspraak. Per toestel bewaren is hier dus niet de makkelijke weg maar de
// juiste.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const CAL_TITLE = 'justmyplan';
const CAL_COLOR = '#2563EB';

const cfgKey = (userId) => `jmp_calsync_cfg_${userId}`;
const mapKey = (userId) => `jmp_calsync_map_${userId}`;

// ── Instellingen ──────────────────────────────────────────────────────────────
// { enabled, calendarId, calendarTitle, accountName }
export async function getSyncConfig(userId) {
  try {
    const raw = await AsyncStorage.getItem(cfgKey(userId));
    return raw ? JSON.parse(raw) : { enabled: false };
  } catch { return { enabled: false }; }
}

export async function setSyncConfig(userId, cfg) {
  try { await AsyncStorage.setItem(cfgKey(userId), JSON.stringify(cfg)); } catch {}
}

// ── Koppeling JMP-afspraak → afspraak op dit toestel ──────────────────────────
async function getMap(userId) {
  try {
    const raw = await AsyncStorage.getItem(mapKey(userId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveMap(userId, map) {
  try { await AsyncStorage.setItem(mapKey(userId), JSON.stringify(map)); } catch {}
}

// Alle toestel-ids die wíj hebben aangemaakt. De importer slaat deze over, zodat
// een afspraak die JMP naar de telefoon schreef niet even later als "nieuw"
// weer naar binnen komt. Zonder deze rem krijg je een lus die bij elke import
// duplicaten blijft opstapelen.
export async function getOwnDeviceEventIds(userId) {
  return new Set(Object.values(await getMap(userId)));
}

// ── Doelagenda kiezen ─────────────────────────────────────────────────────────
// Accounts waar we een eigen agenda in mogen aanmaken. Lokale agenda's laten we
// weg: die blijven op het toestel staan en halen de cloud nooit, dus daar heb
// je voor terugsync niets aan.
export async function listTargets() {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writable = cals.filter(c => c.allowsModifications);

  const accounts = [];
  if (Platform.OS === 'ios') {
    const seen = new Set();
    for (const c of writable) {
      const src = c.source || {};
      // alleen accounts die daadwerkelijk naar buiten synchroniseren
      if (src.type !== Calendar.SourceType.CALDAV && src.type !== Calendar.SourceType.EXCHANGE) continue;
      if (!src.id || seen.has(src.id)) continue;
      seen.add(src.id);
      accounts.push({ kind: 'account', id: src.id, name: src.name || 'Account', source: src });
    }
  }

  // Bestaande agenda's als terugvaloptie: handig als iOS geen nieuwe agenda in
  // een account toestaat, wat bij sommige Google-koppelingen gebeurt.
  const existing = writable.map(c => ({
    kind: 'calendar', id: c.id, name: c.title,
    accountName: c.source?.name || '', color: c.color,
  }));

  return { accounts, existing };
}

// Maak, of hervind, de justmyplan-agenda binnen een account.
async function ensureCalendarInAccount(account) {
  const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const hit = cals.find(c => c.title === CAL_TITLE && c.source?.id === account.id);
  if (hit) return hit.id;

  return Calendar.createCalendarAsync({
    title: CAL_TITLE,
    color: CAL_COLOR,
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: account.id,
    source: account.source,
    name: CAL_TITLE,
    ownerAccount: account.name,
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

// Zet terugsync aan voor het gekozen doel. Een account krijgt een eigen
// justmyplan-agenda; bij een bestaande agenda schrijven we daar rechtstreeks in.
export async function enableSync(userId, target) {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new Error('Geen toegang tot je agenda.');

  let calendarId, calendarTitle, accountName;
  if (target.kind === 'account') {
    calendarId    = await ensureCalendarInAccount(target);
    calendarTitle = CAL_TITLE;
    accountName   = target.name;
  } else {
    calendarId    = target.id;
    calendarTitle = target.name;
    accountName   = target.accountName;
  }

  const cfg = { enabled: true, calendarId, calendarTitle, accountName };
  await setSyncConfig(userId, cfg);
  return cfg;
}

// Uitzetten laat de afspraken staan die al op de telefoon terecht zijn gekomen.
// Ze stilletjes weggooien zou dataverlies zijn in je échte agenda; opruimen is
// een bewuste keuze die de gebruiker zelf maakt.
export async function disableSync(userId) {
  await setSyncConfig(userId, { enabled: false });
}

// ── Schrijven ─────────────────────────────────────────────────────────────────
function toDeviceDates(ev) {
  const [y, m, d] = String(ev.date).split('-').map(Number);
  const start = new Date(y, m - 1, d, ev.startH ?? 0, ev.startM ?? 0, 0, 0);
  const end   = new Date(y, m - 1, d, ev.endH ?? 0, ev.endM ?? 0, 0, 0);
  // Eindtijd vóór starttijd is in JMP mogelijk maar op de telefoon ongeldig;
  // we maken er dan een blok van een half uur van in plaats van te weigeren.
  if (end <= start) end.setTime(start.getTime() + 30 * 60 * 1000);
  return { start, end };
}

function toDeviceEvent(ev) {
  const { start, end } = toDeviceDates(ev);
  return {
    title: ev.title || 'Afspraak',
    startDate: start,
    endDate: end,
    notes: ev.note || undefined,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

// Zet één afspraak op de telefoon. Bestaat hij daar al, dan werken we hem bij.
// Is hij daar handmatig verwijderd, dan maken we hem opnieuw aan in plaats van
// te struikelen over de ontbrekende id.
export async function pushEvent(userId, ev) {
  const cfg = await getSyncConfig(userId);
  if (!cfg.enabled || !cfg.calendarId || !ev?.id) return;

  const map = await getMap(userId);
  const existingId = map[ev.id];
  const details = toDeviceEvent(ev);

  if (existingId) {
    try {
      await Calendar.updateEventAsync(existingId, details);
      return;
    } catch {
      delete map[ev.id];
    }
  }

  const deviceId = await Calendar.createEventAsync(cfg.calendarId, details);
  map[ev.id] = deviceId;
  await saveMap(userId, map);
}

export async function removeEvent(userId, jmpEventId) {
  const cfg = await getSyncConfig(userId);
  if (!cfg.enabled || !jmpEventId) return;

  const map = await getMap(userId);
  const deviceId = map[jmpEventId];
  if (!deviceId) return;

  try { await Calendar.deleteEventAsync(deviceId); } catch {}
  delete map[jmpEventId];
  await saveMap(userId, map);
}

// Alles in één keer wegschrijven, voor als je terugsync net aanzet of als de
// telefoon een tijd niet is bijgewerkt. Geeft terug hoeveel er gelukt zijn.
export async function pushAll(userId, events, onProgress) {
  const cfg = await getSyncConfig(userId);
  if (!cfg.enabled || !cfg.calendarId) return { pushed: 0, failed: 0 };

  let pushed = 0, failed = 0;
  for (const ev of events) {
    try { await pushEvent(userId, ev); pushed++; }
    catch { failed++; }
    if (onProgress && (pushed + failed) % 5 === 0) onProgress(pushed + failed, events.length);
  }
  return { pushed, failed };
}

// Koppelingen opruimen voor afspraken die in JMP niet meer bestaan, zodat de
// map niet eindeloos aangroeit.
export async function pruneMap(userId, events) {
  const alive = new Set(events.map(e => e.id));
  const map = await getMap(userId);
  let changed = false;
  for (const jmpId of Object.keys(map)) {
    if (!alive.has(jmpId)) { delete map[jmpId]; changed = true; }
  }
  if (changed) await saveMap(userId, map);
}
