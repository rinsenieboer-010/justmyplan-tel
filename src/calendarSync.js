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

// Een koppeling is { id, fp }: het toestel-id plus een vingerafdruk van de
// afspraak zoals wij hem het laatst hebben weggeschreven. Met die vingerafdruk
// kan reconcile zien wat écht veranderd is, in plaats van elke keer alles
// opnieuw naar de agenda te duwen. Oudere installaties hebben alleen een string
// opgeslagen; die lezen we hier stil om.
function entryOf(v) {
  if (!v) return null;
  return typeof v === 'string' ? { id: v, fp: '' } : v;
}

function fingerprint(ev) {
  return [ev.title || '', ev.date || '', ev.startH, ev.startM, ev.endH, ev.endM, ev.note || ''].join('|');
}

// Alle toestel-ids die wíj hebben aangemaakt. De importer slaat deze over, zodat
// een afspraak die JMP naar de telefoon schreef niet even later als "nieuw"
// weer naar binnen komt. Zonder deze rem krijg je een lus die bij elke import
// duplicaten blijft opstapelen.
export async function getOwnDeviceEventIds(userId) {
  const map = await getMap(userId);
  return new Set(Object.values(map).map(v => entryOf(v)?.id).filter(Boolean));
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
// Interne variant die op een al geladen map werkt, zodat reconcile niet voor
// elke afspraak opnieuw uit AsyncStorage leest.
async function writeOne(calendarId, map, ev) {
  const entry = entryOf(map[ev.id]);
  const details = toDeviceEvent(ev);

  if (entry) {
    try {
      await Calendar.updateEventAsync(entry.id, details);
      map[ev.id] = { id: entry.id, fp: fingerprint(ev) };
      return 'updated';
    } catch {
      // Handmatig verwijderd op het toestel: opnieuw aanmaken in plaats van
      // struikelen over de id die er niet meer is.
      delete map[ev.id];
    }
  }

  const deviceId = await Calendar.createEventAsync(calendarId, details);
  map[ev.id] = { id: deviceId, fp: fingerprint(ev) };
  return 'created';
}

export async function pushEvent(userId, ev) {
  const cfg = await getSyncConfig(userId);
  if (!cfg.enabled || !cfg.calendarId || !ev?.id) return;

  const map = await getMap(userId);
  await writeOne(cfg.calendarId, map, ev);
  await saveMap(userId, map);
}

export async function removeEvent(userId, jmpEventId) {
  const cfg = await getSyncConfig(userId);
  if (!cfg.enabled || !jmpEventId) return;

  const map = await getMap(userId);
  const entry = entryOf(map[jmpEventId]);
  if (!entry) return;

  try { await Calendar.deleteEventAsync(entry.id); } catch {}
  delete map[jmpEventId];
  await saveMap(userId, map);
}

// ── Gelijktrekken ─────────────────────────────────────────────────────────────
// De volledige vergelijking tussen justmyplan en de agenda op dit toestel:
// ontbrekende afspraken aanmaken, gewijzigde bijwerken, en afspraken die in
// justmyplan niet meer bestaan ook echt van het toestel verwijderen.
//
// Dit is wat wijzigingen uit de webapp laat landen. Die komen via Supabase
// binnen zonder ooit door addEvent/updateEvent hier op de telefoon te gaan, dus
// zonder deze pas zou je ze nooit in Apple of Google Agenda zien.
//
// allowDeletes bestaat omdat loadEvents een lege lijst teruggeeft zowel bij
// "geen afspraken" als bij een mislukte netwerkoproep. Zou je dat verschil
// negeren, dan wist een haperende verbinding je hele agenda leeg. De aanroeper
// zet de vlag alleen als hij zeker weet dat de data echt geladen is.
export async function reconcile(userId, events, { allowDeletes = false, onProgress } = {}) {
  const cfg = await getSyncConfig(userId);
  if (!cfg.enabled || !cfg.calendarId) return { created: 0, updated: 0, removed: 0, failed: 0 };

  const map = await getMap(userId);
  let created = 0, updated = 0, removed = 0, failed = 0, done = 0;

  for (const ev of events) {
    if (!ev?.id) continue;
    const entry = entryOf(map[ev.id]);
    // Onveranderd sinds de vorige keer: overslaan. Zo blijft deze pas goedkoop
    // genoeg om bij elke app-opening te draaien.
    if (entry && entry.fp === fingerprint(ev)) { done++; continue; }
    try {
      const what = await writeOne(cfg.calendarId, map, ev);
      if (what === 'created') created++; else updated++;
    } catch { failed++; }
    done++;
    if (onProgress && done % 5 === 0) onProgress(done, events.length);
  }

  if (allowDeletes) {
    const alive = new Set(events.map(e => e.id));
    for (const jmpId of Object.keys(map)) {
      if (alive.has(jmpId)) continue;
      const entry = entryOf(map[jmpId]);
      if (entry) { try { await Calendar.deleteEventAsync(entry.id); removed++; } catch {} }
      delete map[jmpId];
    }
  }

  await saveMap(userId, map);
  return { created, updated, removed, failed };
}
