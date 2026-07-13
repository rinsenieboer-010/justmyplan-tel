import { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Calendar from 'expo-calendar';
import { useData } from '../context/DataContext';
import { addEventDB } from '../db';
import { dateKey } from '../utils';

// Importvenster: van 1 maand terug tot 12 maanden vooruit. Herhalende
// afspraken worden door iOS binnen dit venster uitgevouwen naar losse items.
const MONTHS_BACK = 1;
const MONTHS_AHEAD = 12;

// Beste match van een kalenderkleur (hex) naar de 5 JMP-kleuren
const JMP_COLORS = { blue: [37,99,235], red: [220,38,38], yellow: [230,180,0], green: [22,163,74], purple: [147,51,234] };
function nearestColor(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '');
  if (!m) return 'blue';
  const n = parseInt(m[1], 16);
  const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  let best = 'blue', bestD = Infinity;
  for (const [name, [cr, cg, cb]] of Object.entries(JMP_COLORS)) {
    const d = (r-cr)**2 + (g-cg)**2 + (b-cb)**2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

export default function ImportCalendarModal({ visible, onClose }) {
  const { userId, events, refresh } = useData();
  const [phase, setPhase] = useState('pick');       // pick | busy | done | denied
  const [calendars, setCalendars] = useState([]);
  const [selected, setSelected] = useState({});     // calendarId -> bool
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState({ imported: 0, skipped: 0 });

  useEffect(() => {
    if (!visible) return;
    setPhase('pick');
    (async () => {
      const { status } = await Calendar.requestCalendarPermissionsAsync();
      if (status !== 'granted') { setPhase('denied'); return; }
      const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      // Verjaardagen-kalender overslaan (alleen-lezen systeemruis)
      const usable = cals.filter(c => c.type !== Calendar.CalendarType.BIRTHDAYS);
      setCalendars(usable);
      const sel = {};
      usable.forEach(c => { sel[c.id] = c.allowsModifications || usable.length === 1; });
      setSelected(sel);
    })();
  }, [visible]);

  const toggle = (id) => setSelected(s => ({ ...s, [id]: !s[id] }));

  const runImport = async () => {
    const ids = calendars.filter(c => selected[c.id]).map(c => c.id);
    if (ids.length === 0) { Alert.alert('Kies minstens één kalender'); return; }
    setPhase('busy');
    try {
      const start = new Date(); start.setMonth(start.getMonth() - MONTHS_BACK);
      const end = new Date(); end.setMonth(end.getMonth() + MONTHS_AHEAD);
      const items = await Calendar.getEventsAsync(ids, start, end);

      // Kleur per kalender bepalen
      const calColor = {};
      calendars.forEach(c => { calColor[c.id] = nearestColor(c.color); });

      // Dedupe tegen bestaande JMP-afspraken (titel + datum + starttijd)
      const existing = new Set(events.map(e => e.title + '|' + e.date + '|' + e.startH + ':' + e.startM));

      let imported = 0, skipped = 0;
      for (const ev of items) {
        const s = new Date(ev.startDate);
        const e = new Date(ev.endDate || ev.startDate);
        const date = dateKey(s);
        // Hele dag → volle band in het JMP-raster; anders echte tijden
        // (einde geclamped op dezelfde dag, JMP kent geen meerdaagse blokken)
        const sameDay = dateKey(e) === date;
        const jmpEvent = ev.allDay
          ? { startH: 8, startM: 0, endH: 22, endM: 0 }
          : {
              startH: s.getHours(), startM: s.getMinutes(),
              endH: sameDay ? e.getHours() : 23, endM: sameDay ? e.getMinutes() : 59,
            };
        const key = (ev.title || 'Afspraak') + '|' + date + '|' + jmpEvent.startH + ':' + jmpEvent.startM;
        if (existing.has(key)) { skipped++; continue; }
        existing.add(key);
        await addEventDB(userId, {
          title: ev.title || 'Afspraak',
          date,
          ...jmpEvent,
          color: calColor[ev.calendarId] || 'blue',
          note: [ev.notes, '📥 Geïmporteerd uit Apple Agenda'].filter(Boolean).join('\n'),
        });
        imported++;
        if (imported % 10 === 0) setProgress(imported + ' afspraken overgezet...');
      }
      await refresh();
      setResult({ imported, skipped });
      setPhase('done');
    } catch (err) {
      Alert.alert('Import mislukt', err?.message || 'Onbekende fout');
      setPhase('pick');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}
        activeOpacity={1} onPress={phase === 'busy' ? undefined : onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor:'#18181b', borderRadius:16, width:320, maxHeight:'80%', padding:24 }}>
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
            <Text style={{ flex:1, color:'#f9fafb', fontSize:15, fontWeight:'700' }}>📥  Agenda importeren</Text>
            {phase !== 'busy' && (
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {phase === 'denied' && (
            <Text style={{ color:'#9ca3af', fontSize:13, lineHeight:19 }}>
              Geen toegang tot je agenda. Geef justmyplan toegang via Instellingen → Privacy → Agenda's, en probeer het opnieuw.
            </Text>
          )}

          {phase === 'pick' && (
            <>
              <Text style={{ color:'#6b7280', fontSize:12, lineHeight:18, marginBottom:14 }}>
                Kies welke kalenders je wilt overzetten. Alles van {MONTHS_BACK} maand terug tot {MONTHS_AHEAD} maanden vooruit komt in justmyplan (herhalende afspraken worden uitgevouwen). Al bestaande afspraken worden overgeslagen.
              </Text>
              <Text style={{ color:'#3f3f46', fontSize:11, lineHeight:16, marginBottom:10 }}>
                Google Agenda? Voeg je Google-account toe via Instellingen → Apps → Agenda → Accounts; de kalenders verschijnen dan hieronder.
              </Text>
              <ScrollView style={{ maxHeight:260 }} showsVerticalScrollIndicator={false}>
                {calendars.map(c => (
                  <TouchableOpacity key={c.id} onPress={() => toggle(c.id)}
                    style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#27272a' }}>
                    <View style={{ width:10, height:10, borderRadius:5, backgroundColor: c.color || '#6b7280' }} />
                    <Text style={{ flex:1, color:'#f9fafb', fontSize:13 }} numberOfLines={1}>{c.title}</Text>
                    <View style={{ width:22, height:22, borderRadius:6, borderWidth:2, borderColor: selected[c.id] ? '#2563EB' : '#3f3f46', backgroundColor: selected[c.id] ? '#2563EB' : 'transparent', justifyContent:'center', alignItems:'center' }}>
                      {selected[c.id] && <Ionicons name="checkmark" size={14} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                ))}
                {calendars.length === 0 && <Text style={{ color:'#3f3f46', fontSize:12 }}>Geen kalenders gevonden.</Text>}
              </ScrollView>
              <TouchableOpacity onPress={runImport}
                style={{ backgroundColor:'#2563EB', borderRadius:8, paddingVertical:12, alignItems:'center', marginTop:16 }}>
                <Text style={{ color:'#fff', fontSize:14, fontWeight:'700' }}>Importeren</Text>
              </TouchableOpacity>
            </>
          )}

          {phase === 'busy' && (
            <View style={{ alignItems:'center', paddingVertical:20, gap:12 }}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={{ color:'#9ca3af', fontSize:13 }}>{progress || 'Afspraken ophalen...'}</Text>
            </View>
          )}

          {phase === 'done' && (
            <View style={{ alignItems:'center', paddingVertical:12, gap:10 }}>
              <Text style={{ fontSize:36 }}>✅</Text>
              <Text style={{ color:'#f9fafb', fontSize:14, fontWeight:'600' }}>
                {result.imported} afspraken overgezet
              </Text>
              {result.skipped > 0 && (
                <Text style={{ color:'#6b7280', fontSize:12 }}>{result.skipped} overgeslagen (stonden er al in)</Text>
              )}
              <TouchableOpacity onPress={onClose}
                style={{ backgroundColor:'#27272a', borderRadius:8, paddingVertical:10, paddingHorizontal:24, marginTop:8 }}>
                <Text style={{ color:'#f9fafb', fontSize:13, fontWeight:'600' }}>Sluiten</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
