import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, TextInput, ScrollView, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import { dateKey, getTodayKey, getWeekDates, DAYS_SHORT, MONTHS, MONTHS_SHORT, pad, OWN_EVENT_COLORS, PERSON_COLORS } from '../utils';

const EVENT_BG     = { blue: '#DBEAFE', red: '#FEE2E2', yellow: '#FFF176', green: '#DCFCE7', purple: '#F3E8FF' };
const EVENT_BORDER = { blue: '#2563EB', red: '#DC2626', yellow: '#E6B400', green: '#16a34a', purple: '#9333ea' };
const EVENT_TEXT   = { blue: '#1d4ed8', red: '#b91c1c', yellow: '#92400e', green: '#15803d', purple: '#7e22ce' };

// Korte weergavenaam uit e-mail (deel vóór de @)
const shortName = (email) => (email || '').split('@')[0];

const PRIO_BG    = { '': '#f3f4f6', hoog: '#FEE2E2', midden: '#FFF176', laag: '#DBEAFE' };
const PRIO_COLOR = { '': '#9ca3af', hoog: '#DC2626', midden: '#92400e', laag: '#1d4ed8' };

const SLOT_H    = 60;   // pixels per uur
const HOUR_FROM = 8;    // raster begint om 08:00 (07:00–08:00 is de taken-rij)
const HOUR_TO   = 22;
const HOURS     = Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => i + HOUR_FROM);
const TIME_COL  = 30;   // breedte van tijdlabel-kolom (smal: alleen uur)

// ── TIME PICKER ───────────────────────────────────────────────────────────────
function TimeRow({ label, h, m, onChangeH, onChangeM }) {
  return (
    <View style={tp.row}>
      <Text style={tp.label}>{label}</Text>
      <View style={tp.controls}>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeH(Math.max(HOUR_FROM, h - 1))}>
          <Text style={tp.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={tp.timeText}>{pad(h)}</Text>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeH(Math.min(HOUR_TO - 1, h + 1))}>
          <Text style={tp.btnText}>+</Text>
        </TouchableOpacity>
        <Text style={tp.colon}>:</Text>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeM(m === 0 ? 30 : 0)}>
          <Text style={tp.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={tp.timeText}>{pad(m)}</Text>
        <TouchableOpacity style={tp.btn} onPress={() => onChangeM(m === 0 ? 30 : 0)}>
          <Text style={tp.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label:    { fontSize: 13, color: '#6b7280', width: 36 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  btn:      { width: 30, height: 30, borderRadius: 6, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  btnText:  { fontSize: 16, color: '#374151', fontWeight: '700' },
  timeText: { fontSize: 16, fontWeight: '700', color: '#111827', width: 30, textAlign: 'center' },
  colon:    { fontSize: 16, fontWeight: '700', color: '#111827', marginHorizontal: 2 },
});

// ── EVENT MODAL ───────────────────────────────────────────────────────────────
function EventModal({ event, selectedDate, invitees = [], onSave, onDelete, onClose }) {
  const isNew = !event?.id;
  const [title,  setTitle]  = useState(event?.title  || '');
  const [startH, setStartH] = useState(event?.startH ?? 9);
  const [startM, setStartM] = useState(event?.startM ?? 0);
  const [endH,   setEndH]   = useState(event?.endH   ?? 10);
  const [endM,   setEndM]   = useState(event?.endM   ?? 0);
  const [color,  setColor]  = useState(event?.color  || 'blue');
  const [note,   setNote]   = useState(event?.note   || '');
  const [sharedWith, setSharedWith] = useState(event?.sharedWith || []);

  const toggleShare = (email) =>
    setSharedWith(sw => sw.includes(email) ? sw.filter(e => e !== email) : [...sw, email]);

  const save = () => {
    if (!title.trim()) { Alert.alert('Voer een titel in'); return; }
    onSave({
      ...(isNew ? {} : event),
      title: title.trim(), date: selectedDate, startH, startM, endH, endM, color, note,
      shared: sharedWith.length > 0, sharedWith,
    });
  };

  return (
    <Modal animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={em.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={em.sheet}>
          <View style={em.handle} />
          <Text style={em.sheetTitle}>{isNew ? 'Afspraak toevoegen' : 'Afspraak bewerken'}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <TextInput
              style={em.titleInput}
              placeholder="Titel..."
              placeholderTextColor="#9ca3af"
              value={title}
              onChangeText={setTitle}
              autoFocus={isNew}
            />
            <TimeRow label="Van" h={startH} m={startM} onChangeH={setStartH} onChangeM={setStartM} />
            <TimeRow label="Tot" h={endH}   m={endM}   onChangeH={setEndH}   onChangeM={setEndM} />
            <Text style={em.label}>Kleur</Text>
            <View style={em.colorRow}>
              {OWN_EVENT_COLORS.map(([key, hex]) => (
                <TouchableOpacity key={key}
                  style={[em.colorDot, { backgroundColor: hex }, color === key && em.colorDotActive]}
                  onPress={() => setColor(key)} />
              ))}
            </View>

            {/* Zichtbaar voor — alleen ik, of specifieke personen */}
            {invitees.length > 0 && (
              <>
                <Text style={em.label}>Zichtbaar voor</Text>
                <View style={em.shareRow}>
                  <TouchableOpacity
                    style={[em.shareChip, sharedWith.length === 0 && em.shareChipMe]}
                    onPress={() => setSharedWith([])}>
                    <Text style={[em.shareChipText, sharedWith.length === 0 && { color: '#fff' }]}>Alleen ik</Text>
                  </TouchableOpacity>
                  {invitees.map(email => {
                    const on = sharedWith.includes(email);
                    return (
                      <TouchableOpacity key={email}
                        style={[em.shareChip, on && em.shareChipOn]}
                        onPress={() => toggleShare(email)}>
                        <Text style={[em.shareChipText, on && { color: '#fff' }]}>{on ? '✓ ' : ''}{shortName(email)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <Text style={em.label}>Notitie</Text>
            <TextInput
              style={em.noteInput}
              placeholder="Notitie (optioneel)..."
              placeholderTextColor="#9ca3af"
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
            />
            <TouchableOpacity style={em.saveBtn} onPress={save}>
              <Text style={em.saveBtnText}>{isNew ? 'Toevoegen' : 'Opslaan'}</Text>
            </TouchableOpacity>
            {!isNew && (
              <TouchableOpacity style={em.deleteBtn} onPress={() => { onDelete(event.id); onClose(); }}>
                <Text style={em.deleteBtnText}>Verwijderen</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const em = StyleSheet.create({
  overlay:        { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet:          { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 24, maxHeight: '85%' },
  handle:         { width: 36, height: 4, backgroundColor: '#d1d5db', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  titleInput:     { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 12, fontSize: 16, color: '#111827', marginBottom: 16 },
  label:          { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  colorRow:       { flexDirection: 'row', gap: 12, marginBottom: 16 },
  colorDot:       { width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: 'transparent' },
  colorDotActive: { borderColor: '#111827' },
  shareRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  shareChip:      { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  shareChipMe:    { backgroundColor: '#374151', borderColor: '#374151' },
  shareChipOn:    { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  shareChipText:  { fontSize: 13, color: '#374151', fontWeight: '600' },
  noteInput:      { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, fontSize: 14, color: '#111827', marginBottom: 16, minHeight: 70, textAlignVertical: 'top' },
  saveBtn:        { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginBottom: 10 },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn:      { backgroundColor: '#FEE2E2', borderRadius: 8, paddingVertical: 13, alignItems: 'center' },
  deleteBtnText:  { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});

// ── CALENDAR SCREEN ───────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const { tasks, events, sharedEvents, personColors, outgoingShares, addEvent, updateEvent, deleteEvent } = useData();
  const [weekBase, setWeekBase]     = useState(new Date());
  const [modalEvent, setModalEvent] = useState(undefined);
  const scrollRef = useRef(null);

  const weekDates = getWeekDates(weekBase);
  const todayKey  = getTodayKey();

  // Personen met wie ik kan delen (geaccepteerde uitnodigingen die ik verstuurde)
  const invitees = (outgoingShares || []).filter(s => s.status === 'accepted').map(s => s.invited_email);

  // Visuele stijl van een gedeelde afspraak op basis van de toegewezen persoonskleur
  const NEUTRAL = { dot: '#9ca3af', bg: '#F3F4F6', border: '#9ca3af', text: '#6b7280' };
  const personStyle = (email) => PERSON_COLORS[personColors[email]] || NEUTRAL;

  // "Hele dag"-afspraak: omspant (vrijwel) het hele zichtbare raster → toon als
  // chip in de hele-dag-strip i.p.v. als blok (anders staat de titel buiten beeld).
  const evMin = (h, m) => h * 60 + m;
  const isAllDay = (e) => evMin(e.startH, e.startM) <= HOUR_FROM * 60 && evMin(e.endH, e.endM) >= HOUR_TO * 60;
  const GRID_H = HOURS.length * SLOT_H;

  const prevWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() - 7); setWeekBase(d); };
  const nextWeek = () => { const d = new Date(weekBase); d.setDate(d.getDate() + 7); setWeekBase(d); };

  // Standaard rond 8:00 in beeld (7:30 net bovenaan), op vandaag rond de huidige tijd
  useEffect(() => {
    const now = new Date();
    const inWeek = weekDates.some(d => dateKey(d) === todayKey);
    const scrollHour = inWeek ? Math.max(HOUR_FROM, now.getHours() - 1) : 8;
    const y = Math.max(0, (scrollHour - HOUR_FROM) * SLOT_H - SLOT_H / 2);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 100);
  }, [weekBase]);

  const handleSave = async (eventData) => {
    if (eventData.id) {
      await updateEvent(eventData);
    } else {
      await addEvent(eventData);
    }
    setModalEvent(undefined);
  };

  // Nieuwe afspraak op een specifieke dag + uur
  const openNewEvent = (dateStr, h) => {
    setModalEvent({ date: dateStr, startH: h, startM: 0, endH: Math.min(h + 1, HOUR_TO - 1), endM: 0 });
  };

  const monthLabel = weekDates[0].getMonth() === weekDates[6].getMonth()
    ? `${MONTHS[weekDates[0].getMonth()]} ${weekDates[6].getFullYear()}`
    : `${MONTHS_SHORT[weekDates[0].getMonth()]} – ${MONTHS_SHORT[weekDates[6].getMonth()]} ${weekDates[6].getFullYear()}`;

  // Taken met deadline deze week (per dag), om eventueel een strip te tonen.
  // Taken mét een herinneringstijd staan niet in de strip maar in het raster.
  const hasAnyDeadlineTask = weekDates.some(d => tasks.some(t => t.deadline === dateKey(d) && !t.reminderTime));

  // Positie in het raster voor een taak met herinneringstijd (geclamped op het
  // zichtbare bereik zodat vroege/late tijden niet buiten beeld vallen)
  const taskGridTop = (reminderTime) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(reminderTime || '');
    if (!m) return null;
    const mins = Number(m[1]) * 60 + Number(m[2]);
    const clamped = Math.min(Math.max(mins, HOUR_FROM * 60), HOUR_TO * 60 - 30);
    return (clamped - HOUR_FROM * 60) / 60 * SLOT_H;
  };

  return (
    <View style={s.container}>

      {/* Week navigatie */}
      <View style={s.weekNav}>
        <TouchableOpacity onPress={prevWeek} style={s.weekNavBtn}>
          <Ionicons name="chevron-back" size={20} color="#374151" />
        </TouchableOpacity>
        <Text style={s.weekNavLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextWeek} style={s.weekNavBtn}>
          <Ionicons name="chevron-forward" size={20} color="#374151" />
        </TouchableOpacity>
      </View>

      {/* Dag-koppen (uitgelijnd met de rasterkolommen) */}
      <View style={s.headerRow}>
        <View style={{ width: TIME_COL }} />
        {weekDates.map((d, i) => {
          const isToday = dateKey(d) === todayKey;
          return (
            <View key={i} style={[s.headerCol, isToday && s.headerColToday]}>
              <Text style={[s.headerName, isToday && s.headerTodayText]}>{DAYS_SHORT[i]}</Text>
              <Text style={[s.headerNum, isToday && s.headerTodayText]}>{d.getDate()}</Text>
            </View>
          );
        })}
      </View>

      {/* Taken-rij (waar voorheen 07:00–08:00 zat): taken van die dag, gestapeld.
          Rekt mee als er veel taken op één dag staan. */}
      {hasAnyDeadlineTask && (
        <View style={s.taskRow}>
          <View style={{ width: TIME_COL, justifyContent: 'center' }}>
            <Text style={s.taskRowLabel}>taken</Text>
          </View>
          {weekDates.map((d, i) => {
            const dayTasks = tasks.filter(t => t.deadline === dateKey(d) && !t.reminderTime);
            return (
              <View key={i} style={s.taskCol}>
                {dayTasks.map(task => (
                  <View key={task.id} style={[s.taskChip, { backgroundColor: PRIO_BG[task.priority] || '#f3f4f6', borderLeftColor: PRIO_COLOR[task.priority] || '#9ca3af' }]}>
                    <Text style={[s.taskChipText, { color: PRIO_COLOR[task.priority] || '#6b7280' }]} numberOfLines={1}>{task.title}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {/* Tijdraster — week */}
      <ScrollView ref={scrollRef} style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={[s.gridRow, { height: HOURS.length * SLOT_H + 12 }]}>

          {/* Tijd-gootje met uurlabels */}
          <View style={{ width: TIME_COL }}>
            {HOURS.map(h => (
              <Text key={h} style={[s.timeLabel, { top: (h - HOUR_FROM) * SLOT_H - 6 }]}>{pad(h)}</Text>
            ))}
          </View>

          {/* 7 dag-kolommen */}
          {weekDates.map((d, dayIdx) => {
            const key       = dateKey(d);
            const isToday   = key === todayKey;
            const dayEvents = events.filter(e => e.date === key && !isAllDay(e));
            return (
              <View key={dayIdx} style={[s.dayCol, isToday && s.dayColToday]}>
                {/* Uurlijnen + klikvlakken */}
                {HOURS.map(h => (
                  <View key={h}>
                    <View style={[s.hourLine, { top: (h - HOUR_FROM) * SLOT_H }]} />
                    <TouchableOpacity
                      style={[s.tapZone, { top: (h - HOUR_FROM) * SLOT_H, height: SLOT_H }]}
                      onPress={() => openNewEvent(key, h)}
                      activeOpacity={0.3}
                    />
                  </View>
                ))}

                {/* Hele-dag-afspraken: smalle volle band (08:00 → einde), titel bovenaan */}
                {[
                  ...events.filter(e => e.date === key && isAllDay(e)).map(e => ({ ev: e, mine: true })),
                  ...sharedEvents.filter(e => e.date === key && isAllDay(e)).map(e => ({ ev: e, mine: false })),
                ].map(({ ev, mine }, i) => {
                  const ps = mine ? null : personStyle(ev.ownerEmail);
                  const bg = mine ? (EVENT_BG[ev.color] || '#DBEAFE') : ps.bg;
                  const bd = mine ? (EVENT_BORDER[ev.color] || '#2563EB') : ps.border;
                  const tx = mine ? (EVENT_TEXT[ev.color] || '#1d4ed8') : ps.text;
                  return (
                    <TouchableOpacity key={'ad-' + ev.id}
                      onPress={() => mine ? setModalEvent(ev) : Alert.alert(ev.title, `${shortName(ev.ownerEmail)} · hele dag`)}
                      style={[s.allDayBlock, { height: GRID_H, left: 1 + i * 8, backgroundColor: bg, borderLeftColor: bd, borderColor: bd, borderStyle: mine ? 'solid' : 'dashed' }]}>
                      <Text style={[s.allDayBlockText, { color: tx }]} numberOfLines={6}>{ev.title}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Gedeelde afspraken van anderen (onder, in hun persoonskleur, gestreepte rand) */}
                {sharedEvents.filter(e => e.date === key && !isAllDay(e)).map(ev => {
                  const rawTop = (ev.startH - HOUR_FROM + ev.startM / 60) * SLOT_H;
                  const top    = Math.max(0, rawTop);
                  const height = Math.max((ev.endH - HOUR_FROM + ev.endM / 60) * SLOT_H - top, 18);
                  const ps     = personStyle(ev.ownerEmail);
                  return (
                    <TouchableOpacity
                      key={'sh-' + ev.id}
                      onPress={() => Alert.alert(ev.title, `${shortName(ev.ownerEmail)} · ${pad(ev.startH)}:${pad(ev.startM)} – ${pad(ev.endH)}:${pad(ev.endM)}`)}
                      style={[s.sharedBlock, { top, height: height + 8, backgroundColor: ps.bg, borderColor: ps.border }]}
                    >
                      <Text style={[s.sharedName, { color: ps.text }]} numberOfLines={1}>{shortName(ev.ownerEmail)}</Text>
                      <Text style={[s.eventBlockTitle, { color: ps.text }]} numberOfLines={height > 34 ? 2 : 1}>{ev.title}</Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Taken met herinneringstijd: chip op het tijdstip in het raster */}
                {tasks.filter(t => t.deadline === key && t.reminderTime).map(task => {
                  const top = taskGridTop(task.reminderTime);
                  if (top === null) return null;
                  return (
                    <View key={'tk-' + task.id} pointerEvents="none"
                      style={[s.timedTaskChip, { top, backgroundColor: PRIO_BG[task.priority] || '#f3f4f6', borderLeftColor: PRIO_COLOR[task.priority] || '#9ca3af' }]}>
                      <Text style={[s.timedTaskText, { color: PRIO_COLOR[task.priority] || '#6b7280' }]} numberOfLines={1}>✓ {task.title}</Text>
                    </View>
                  );
                })}

                {/* Mijn afspraken (bovenop, vol gekleurd) */}
                {dayEvents.map(ev => {
                  const rawTop = (ev.startH - HOUR_FROM + ev.startM / 60) * SLOT_H;
                  const top    = Math.max(0, rawTop);
                  const height = Math.max((ev.endH - HOUR_FROM + ev.endM / 60) * SLOT_H - top, 18);
                  return (
                    <TouchableOpacity
                      key={ev.id}
                      onPress={() => setModalEvent(ev)}
                      style={[s.eventBlock, {
                        top,
                        height,
                        backgroundColor: EVENT_BG[ev.color]  || '#DBEAFE',
                        borderLeftColor: EVENT_BORDER[ev.color] || '#2563EB',
                      }]}
                    >
                      <Text style={[s.eventBlockTitle, { color: EVENT_TEXT[ev.color] || '#1d4ed8' }]} numberOfLines={height > 30 ? 2 : 1}>
                        {ev.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}

        </View>
      </ScrollView>

      {/* Modal */}
      {modalEvent !== undefined && (
        <EventModal
          event={modalEvent}
          selectedDate={modalEvent?.date || todayKey}
          invitees={invitees}
          onSave={handleSave}
          onDelete={async (id) => { await deleteEvent(id); setModalEvent(undefined); }}
          onClose={() => setModalEvent(undefined)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#fff' },
  weekNav:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  weekNavBtn:     { padding: 8 },
  weekNavLabel:   { fontSize: 14, fontWeight: '600', color: '#374151' },

  // Dag-koppen
  headerRow:      { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerCol:      { flex: 1, alignItems: 'center', paddingVertical: 6, borderLeftWidth: 1, borderLeftColor: '#f3f4f6' },
  headerColToday: { backgroundColor: '#EFF6FF' },
  headerName:     { fontSize: 11, color: '#9ca3af', fontWeight: '600' },
  headerNum:      { fontSize: 15, color: '#111827', fontWeight: '700', marginTop: 1 },
  headerTodayText:{ color: '#2563EB' },

  // Deadline-taken strip
  // Hele-dag-afspraak: volle hoogte, smalle band aan de linkerkant van de dag
  allDayBlock:    { position: 'absolute', top: 0, width: '42%', borderRadius: 4, borderWidth: 1, borderLeftWidth: 3, paddingHorizontal: 3, paddingVertical: 3, overflow: 'hidden', zIndex: 0 },
  allDayBlockText:{ fontSize: 9, fontWeight: '700', lineHeight: 11 },
  taskRow:        { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingVertical: 3, minHeight: 24 },
  taskRowLabel:   { fontSize: 8, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' },
  taskCol:        { flex: 1, paddingHorizontal: 2, gap: 2, borderLeftWidth: 1, borderLeftColor: '#f3f4f6' },
  taskChip:       { borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1 },
  taskChipText:   { fontSize: 9, fontWeight: '600' },
  taskMore:       { fontSize: 8, color: '#9ca3af', fontWeight: '700', paddingLeft: 3 },

  // Tijdraster
  gridRow:        { flexDirection: 'row', position: 'relative' },
  timeLabel:      { position: 'absolute', right: 4, width: TIME_COL - 4, fontSize: 10, color: '#9ca3af', textAlign: 'right' },
  dayCol:         { flex: 1, position: 'relative', borderLeftWidth: 1, borderLeftColor: '#e5e7eb' },
  dayColToday:    { backgroundColor: '#F8FAFF' },
  hourLine:       { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#eef0f2' },
  tapZone:        { position: 'absolute', left: 0, right: 0 },
  eventBlock:     { position: 'absolute', left: 1, right: 1, borderRadius: 4, borderLeftWidth: 2, paddingHorizontal: 3, paddingVertical: 2, overflow: 'hidden', zIndex: 2 },
  eventBlockTitle:{ fontSize: 9, fontWeight: '700', lineHeight: 11 },
  // Gedeelde afspraak: gestreepte rand + persoonskleur, duidelijk anders dan eigen
  // Gedeelde afspraak staat "achter" die van jou: smaller + iets langer, zodat
  // de onderkant eronder uitsteekt (Google-Agenda-stijl).
  sharedBlock:    { position: 'absolute', left: 7, right: 5, borderRadius: 4, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 3, paddingVertical: 1, overflow: 'hidden', zIndex: 1 },
  sharedName:     { fontSize: 7, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
  // Taak op tijdstip: klein chipje in het raster, boven de afspraken
  timedTaskChip:  { position: 'absolute', left: 1, right: 1, borderLeftWidth: 2, borderRadius: 3, paddingHorizontal: 3, paddingVertical: 1, zIndex: 3 },
  timedTaskText:  { fontSize: 9, fontWeight: '600' },
});
