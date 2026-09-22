import { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useData } from '../context/DataContext';
import {
  getSyncConfig, enableSync, disableSync, listTargets, reconcile,
} from '../calendarSync';

// Terugsync: justmyplan-afspraken naar de agenda op de telefoon. Een gekoppeld
// Google-account telt voor iOS gewoon mee als agenda-account, dus wie daarvoor
// kiest krijgt zijn afspraken via iOS vanzelf in Google Agenda.
export default function SyncCalendarModal({ visible, onClose }) {
  const { userId, events } = useData();
  const [phase, setPhase]   = useState('loading');   // loading | pick | on | busy
  const [cfg, setCfg]       = useState({ enabled: false });
  const [targets, setTargets] = useState({ accounts: [], existing: [] });
  const [progress, setProgress] = useState('');

  useEffect(() => {
    if (!visible) return;
    setPhase('loading');
    (async () => {
      const current = await getSyncConfig(userId);
      setCfg(current);
      if (current.enabled) { setPhase('on'); return; }
      try {
        setTargets(await listTargets());
        setPhase('pick');
      } catch (err) {
        Alert.alert('Agenda niet beschikbaar', err?.message || 'Onbekende fout');
        onClose();
      }
    })();
  }, [visible, userId]);

  const turnOn = async (target) => {
    setPhase('busy');
    setProgress('Agenda klaarzetten...');
    try {
      const next = await enableSync(userId, target);
      setCfg(next);
      setProgress('Afspraken wegschrijven...');
      const { created, updated, failed } = await reconcile(userId, events, {
        onProgress: (done, total) => setProgress(`${done} van ${total} afspraken...`),
      });
      setPhase('on');
      Alert.alert(
        'Terugsync staat aan',
        `${created + updated} afspraken staan nu in ${next.calendarTitle}.` +
        (failed ? `\n${failed} lukten niet.` : ''),
      );
    } catch (err) {
      // De meest voorkomende oorzaak: iOS staat geen nieuwe agenda toe binnen
      // dit account. De bestaande agenda's eronder werken dan wel.
      Alert.alert('Aanzetten mislukt', err?.message || 'Onbekende fout');
      setPhase('pick');
    }
  };

  const turnOff = async () => {
    await disableSync(userId);
    setCfg({ enabled: false });
    try { setTargets(await listTargets()); } catch {}
    setPhase('pick');
  };

  const pushNow = async () => {
    setPhase('busy');
    setProgress('Afspraken wegschrijven...');
    const { created, updated, removed, failed } = await reconcile(userId, events, {
      allowDeletes: true,
      onProgress: (done, total) => setProgress(`${done} van ${total} afspraken...`),
    });
    setPhase('on');
    const parts = [];
    if (created) parts.push(`${created} toegevoegd`);
    if (updated) parts.push(`${updated} bijgewerkt`);
    if (removed) parts.push(`${removed} verwijderd`);
    if (failed)  parts.push(`${failed} mislukt`);
    Alert.alert('Klaar', parts.length ? parts.join(', ') + '.' : 'Alles stond al gelijk.');
  };

  const Row = ({ icon, title, sub, onPress }) => (
    <TouchableOpacity onPress={onPress}
      style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:11,
               borderBottomWidth:1, borderBottomColor:'#27272a' }}>
      <Text style={{ fontSize:16 }}>{icon}</Text>
      <View style={{ flex:1 }}>
        <Text style={{ color:'#f9fafb', fontSize:13 }} numberOfLines={1}>{title}</Text>
        {!!sub && <Text style={{ color:'#6b7280', fontSize:11, marginTop:1 }} numberOfLines={1}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color="#3f3f46" />
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}
        activeOpacity={1} onPress={phase === 'busy' ? undefined : onClose}>
        <TouchableOpacity activeOpacity={1} style={{ backgroundColor:'#18181b', borderRadius:16, width:320, maxHeight:'80%', padding:24 }}>
          <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
            <Text style={{ flex:1, color:'#f9fafb', fontSize:15, fontWeight:'700' }}>📤  Agenda terugsync</Text>
            {phase !== 'busy' && (
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={22} color="#9ca3af" />
              </TouchableOpacity>
            )}
          </View>

          {phase === 'loading' && (
            <View style={{ alignItems:'center', paddingVertical:24 }}>
              <ActivityIndicator color="#2563EB" />
            </View>
          )}

          {phase === 'busy' && (
            <View style={{ alignItems:'center', paddingVertical:20, gap:12 }}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={{ color:'#9ca3af', fontSize:13 }}>{progress}</Text>
            </View>
          )}

          {phase === 'pick' && (
            <>
              <Text style={{ color:'#6b7280', fontSize:12, lineHeight:18, marginBottom:14 }}>
                Kies waar justmyplan je afspraken naartoe schrijft. Vanaf dan gaat elke
                nieuwe, gewijzigde of verwijderde afspraak automatisch mee.
              </Text>

              <ScrollView style={{ maxHeight:300 }} showsVerticalScrollIndicator={false}>
                {targets.accounts.length > 0 && (
                  <>
                    <Text style={{ color:'#3f3f46', fontSize:10, fontWeight:'700', letterSpacing:1, marginBottom:4 }}>
                      EIGEN AGENDA AANMAKEN
                    </Text>
                    <Text style={{ color:'#3f3f46', fontSize:11, lineHeight:16, marginBottom:8 }}>
                      Aanbevolen. Je krijgt een aparte justmyplan-agenda die je los aan en uit kunt zetten,
                      zonder je bestaande afspraken te raken.
                    </Text>
                    {targets.accounts.map(a => (
                      <Row key={a.id} icon="☁️" title={a.name} sub="nieuwe justmyplan-agenda"
                        onPress={() => turnOn(a)} />
                    ))}
                  </>
                )}

                <Text style={{ color:'#3f3f46', fontSize:10, fontWeight:'700', letterSpacing:1, marginTop:16, marginBottom:8 }}>
                  OF IN EEN BESTAANDE AGENDA
                </Text>
                {targets.existing.map(c => (
                  <Row key={c.id} icon="📅" title={c.name} sub={c.accountName || undefined}
                    onPress={() => turnOn(c)} />
                ))}
                {targets.existing.length === 0 && targets.accounts.length === 0 && (
                  <Text style={{ color:'#3f3f46', fontSize:12 }}>
                    Geen agenda gevonden waar justmyplan in mag schrijven. Geef toegang via
                    Instellingen, Privacy, Agenda's.
                  </Text>
                )}
              </ScrollView>
            </>
          )}

          {phase === 'on' && (
            <>
              <View style={{ backgroundColor:'#111827', borderRadius:8, padding:12, marginBottom:14 }}>
                <Text style={{ color:'#16a34a', fontSize:11, fontWeight:'700', marginBottom:3 }}>● STAAT AAN</Text>
                <Text style={{ color:'#f9fafb', fontSize:13, fontWeight:'600' }}>{cfg.calendarTitle}</Text>
                {!!cfg.accountName && (
                  <Text style={{ color:'#6b7280', fontSize:11, marginTop:1 }}>{cfg.accountName}</Text>
                )}
              </View>

              <Text style={{ color:'#6b7280', fontSize:11, lineHeight:17, marginBottom:16 }}>
                Wijzigingen die je in de app maakt gaan direct mee. Pas je iets aan in de webapp,
                dan wordt dat een paar seconden later opgepikt zolang de app open is, en anders
                zodra je hem weer opent.
              </Text>

              <TouchableOpacity onPress={pushNow}
                style={{ backgroundColor:'#2563EB', borderRadius:8, paddingVertical:12, alignItems:'center' }}>
                <Text style={{ color:'#fff', fontSize:14, fontWeight:'700' }}>Alles nu bijwerken</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={turnOff}
                style={{ backgroundColor:'#27272a', borderRadius:8, paddingVertical:11, alignItems:'center', marginTop:10 }}>
                <Text style={{ color:'#f9fafb', fontSize:13, fontWeight:'600' }}>Terugsync uitzetten</Text>
              </TouchableOpacity>

              <Text style={{ color:'#3f3f46', fontSize:10, lineHeight:15, marginTop:10, textAlign:'center' }}>
                Uitzetten laat de al weggeschreven afspraken staan.
              </Text>
            </>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}
