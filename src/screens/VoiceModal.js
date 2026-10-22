// Voice-modus: praten met een echte terminal-agent op de laptop, handsfree.
// Ritme: luisteren -> (stilte) -> versturen via de bridge -> antwoord voorlezen
// -> automatisch weer luisteren. Zeg "stop" of "klaar" om te stoppen.
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Animated, Easing,
  AccessibilityInfo, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import { useKeepAwake } from 'expo-keep-awake';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { createAgentRequest, getAgentRequest } from '../db';

const LANG = 'nl-NL';
const SILENCE_MS = 1600;        // zo lang stil na je laatste woord: bericht gaat weg
const IDLE_MS = 15000;          // helemaal niets gehoord: luisteren pauzeert
const REPLY_TIMEOUT_MS = 300000; // gelijk aan de timeout van de bridge
const STILL_BUSY_MS = 25000;    // na zoveel wachten: "ik ben er nog mee bezig"
const MAX_SENTENCES = 4;

// De bridge herkent deze markers: voice-instructies + gespreksgeheugen.
export const VOICE_MARKER = '[[voice]]';
export const VOICE_NEW_MARKER = '[[voice:new]]';

const STOP_RE = /^(stop|stoppen|klaar|einde|dat was het|dat was 't|doei|tot later|ophangen)$/i;
const NEW_RE = /^(nieuw gesprek|opnieuw beginnen|begin opnieuw)$/i;

const AUDIO = {
  category: 'playAndRecord',
  categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'allowBluetoothA2DP'],
  mode: 'default',
};

const COLORS = {
  starting:  '#3f3f46',
  listening: '#2563EB',
  thinking:  '#E6B400',
  speaking:  '#16a34a',
  paused:    '#3f3f46',
};

export function agentKeyFor(agent) {
  return (agent?.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Maak tekst geschikt om voor te lezen: geen markdown, links of code.
export function speakable(text) {
  let t = String(text || '')
    .replace(/```[\s\S]*?```/g, ' De code staat in de app. ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'een link')
    .replace(/^\s*(#+|[-*•]|\d+[.)])\s+/gm, '')
    .replace(/[*_>#|]/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  const sentences = t.match(/[^.!?]+[.!?]*/g) || [t];
  if (sentences.length > MAX_SENTENCES) {
    t = sentences.slice(0, MAX_SENTENCES).join(' ').trim() + ' De rest staat in de app.';
  }
  return t;
}

async function pickDutchVoice() {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const score = (v) =>
      (/premium/i.test(v.identifier || '') ? 4 : 0) +
      (v.quality === Speech.VoiceQuality.Enhanced ? 2 : 0) +
      (v.language === LANG ? 1 : 0);
    const nl = voices.filter((v) => (v.language || '').toLowerCase().startsWith('nl'));
    nl.sort((a, b) => score(b) - score(a));
    return nl[0]?.identifier;
  } catch {
    return undefined;
  }
}

function setAudioCategory() {
  if (Platform.OS !== 'ios') return;
  try { ExpoSpeechRecognitionModule.setCategoryIOS(AUDIO); } catch {}
}

export default function VoiceModal({ visible, onClose, agent, uid }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      {visible && agent && uid ? <VoiceSession agent={agent} uid={uid} onClose={onClose} /> : <View style={s.container} />}
    </Modal>
  );
}

function VoiceSession({ agent, uid, onClose }) {
  useKeepAwake(); // scherm blijft aan, anders stopt de microfoon

  const [phase, setPhaseState] = useState('starting');
  const [heard, setHeard] = useState('');
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [reduceMotion, setReduceMotion] = useState(false);

  const phaseRef = useRef('starting');
  const transcript = useRef('');
  const finals = useRef('');        // Android levert losse stukken
  const silenceTimer = useRef(null);
  const idleTimer = useRef(null);
  const firstTurn = useRef(true);
  const voiceId = useRef(undefined);
  const alive = useRef(true);
  const pulse = useRef(new Animated.Value(1)).current;
  const agentKey = useMemo(() => agentKeyFor(agent), [agent]);

  const setPhase = (p) => { phaseRef.current = p; setPhaseState(p); };
  const clearTimers = () => { clearTimeout(silenceTimer.current); clearTimeout(idleTimer.current); };

  const speak = (text) => new Promise((resolve) => {
    if (!alive.current || !text) return resolve();
    setAudioCategory();
    Speech.speak(text, {
      language: LANG, voice: voiceId.current, rate: 1.0,
      onDone: resolve, onStopped: resolve, onError: resolve,
    });
  });

  const listen = () => {
    if (!alive.current) return;
    clearTimers();
    transcript.current = ''; finals.current = '';
    setHeard(''); setNote(''); setPhase('listening');
    ExpoSpeechRecognitionModule.start({
      lang: LANG, interimResults: true, continuous: true, addsPunctuation: true,
      iosCategory: AUDIO,
    });
    idleTimer.current = setTimeout(() => {
      if (phaseRef.current === 'listening' && !transcript.current.trim()) {
        ExpoSpeechRecognitionModule.abort();
        setPhase('paused');
      }
    }, IDLE_MS);
  };

  const finishUtterance = () => {
    if (phaseRef.current !== 'listening') return;
    clearTimers();
    const text = transcript.current.trim();
    setPhase('thinking');
    ExpoSpeechRecognitionModule.stop();
    if (!text) { setPhase('paused'); return; }
    handleText(text);
  };

  const ask = async (text) => {
    const marker = firstTurn.current ? VOICE_NEW_MARKER : VOICE_MARKER;
    firstTurn.current = false;
    const req = await createAgentRequest(uid, agentKey, agent.name, `${marker}\n${text}`);
    const started = Date.now();
    let warned = false;
    while (alive.current && Date.now() - started < REPLY_TIMEOUT_MS) {
      await new Promise((r) => setTimeout(r, 1500));
      const cur = await getAgentRequest(req.id);
      if (cur?.status === 'done') return { ok: true, reply: cur.reply || '' };
      if (cur?.status === 'error') return { ok: false, reply: cur.reply || '' };
      if (!warned && Date.now() - started > STILL_BUSY_MS) {
        warned = true;
        if (cur?.status === 'pending') {
          await speak('Je laptop reageert nog niet. Ik wacht nog even.');
        } else {
          await speak('Ik ben er nog mee bezig.');
        }
      }
    }
    return null;
  };

  const handleText = async (raw) => {
    const cmd = raw.toLowerCase().replace(/[.!?,]/g, '').trim();
    if (STOP_RE.test(cmd)) {
      await speak('Oké, tot later.');
      onClose();
      return;
    }
    if (NEW_RE.test(cmd)) {
      firstTurn.current = true;
      setAnswer('');
      await speak('Prima, we beginnen opnieuw.');
      listen();
      return;
    }
    try {
      const res = await ask(raw);
      if (!alive.current) return;
      if (!res) {
        setNote('Geen antwoord van je laptop. Staat hij aan en draait de bridge?');
        setPhase('speaking');
        await speak('Ik krijg geen antwoord van je laptop. Staat hij aan en draait de bridge?');
        setPhase('paused');
        return;
      }
      setAnswer(res.reply);
      setPhase('speaking');
      await speak(res.ok ? speakable(res.reply) : 'Dat lukte niet op je laptop. De foutmelding staat in de app.');
      if (alive.current && phaseRef.current === 'speaking') listen();
    } catch (e) {
      setNote('Fout: ' + (e.message || String(e)));
      setPhase('paused');
    }
  };

  // Spraakherkenning: houd bij wat je zegt en wacht op een korte stilte.
  useSpeechRecognitionEvent('result', (e) => {
    if (phaseRef.current !== 'listening') return;
    const piece = e.results?.[0]?.transcript || '';
    if (Platform.OS === 'android') {
      if (e.isFinal) { finals.current = `${finals.current} ${piece}`.trim(); transcript.current = finals.current; }
      else transcript.current = `${finals.current} ${piece}`.trim();
    } else {
      transcript.current = piece; // iOS geeft de hele zin tot nu toe
    }
    setHeard(transcript.current);
    clearTimers();
    silenceTimer.current = setTimeout(finishUtterance, SILENCE_MS);
  });
  useSpeechRecognitionEvent('end', () => {
    // Herkenning stopte vanzelf (bijv. tijdslimiet van iOS) terwijl we nog luisterden.
    if (phaseRef.current !== 'listening') return;
    if (transcript.current.trim()) finishUtterance();
    else { clearTimers(); setPhase('paused'); }
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error === 'aborted') return;
    if (phaseRef.current !== 'listening') return;
    clearTimers();
    if (e.error !== 'no-speech') setNote(e.message || e.error);
    setPhase('paused');
  });

  // Opstarten: rechten vragen, Nederlandse stem kiezen, groeten, luisteren.
  useEffect(() => {
    alive.current = true;
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    (async () => {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setNote('Geef justmyplan toegang tot je microfoon en spraakherkenning in Instellingen.');
        setPhase('paused');
        return;
      }
      voiceId.current = await pickDutchVoice();
      setPhase('speaking');
      await speak(`${agent.name} hier. Ik luister.`);
      if (alive.current) listen();
    })();
    return () => {
      alive.current = false;
      clearTimers();
      Speech.stop();
      try { ExpoSpeechRecognitionModule.abort(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rustige puls tijdens luisteren en spreken (uit bij "Minder beweging").
  useEffect(() => {
    if (reduceMotion || !(phase === 'listening' || phase === 'speaking')) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [phase, reduceMotion, pulse]);

  // Tik op de cirkel: onderbreken, nu versturen of verder luisteren.
  const onTap = () => {
    const p = phaseRef.current;
    if (p === 'speaking') { Speech.stop(); return; }           // speak() resolvet, daarna luistert hij
    if (p === 'listening') { if (transcript.current.trim()) finishUtterance(); return; }
    if (p === 'paused') listen();
  };

  const label = {
    starting:  'Opstarten...',
    listening: 'Ik luister...',
    thinking:  `${agent.name} denkt na op je laptop...`,
    speaking:  'Aan het woord. Tik om te onderbreken.',
    paused:    'Gepauzeerd. Tik om verder te praten.',
  }[phase];
  const icon = { starting: 'ellipsis-horizontal', listening: 'mic', thinking: 'hourglass-outline', speaking: 'volume-high', paused: 'mic-off' }[phase];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={{ width: 44 }} />
        <Text style={s.headerTitle} numberOfLines={1}>{agent.emoji || '🤖'} {agent.name}</Text>
        <TouchableOpacity onPress={onClose} style={s.iconBtn} accessibilityLabel="Voice-modus sluiten">
          <Ionicons name="close" size={24} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      <View style={s.center}>
        <TouchableOpacity onPress={onTap} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={label}>
          <Animated.View style={[s.orb, { backgroundColor: COLORS[phase], transform: [{ scale: pulse }] }]}>
            <Ionicons name={icon} size={56} color="#fff" />
          </Animated.View>
        </TouchableOpacity>
        <Text style={s.label}>{label}</Text>
        {!!note && <Text style={s.note}>{note}</Text>}
      </View>

      <ScrollView style={s.transcript} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!!heard && (
          <View>
            <Text style={s.tLabel}>Jij</Text>
            <Text style={s.tText}>{heard}</Text>
          </View>
        )}
        {!!answer && (
          <View>
            <Text style={[s.tLabel, { color: '#4ade80' }]}>{agent.name}</Text>
            <Text style={s.tText}>{answer}</Text>
          </View>
        )}
        <Text style={s.hint}>Zeg "stop" om te stoppen of "nieuw gesprek" om opnieuw te beginnen.</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#18181b' },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: 52, paddingBottom: 8 },
  headerTitle: { color: '#f9fafb', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  iconBtn:     { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  center:      { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, gap: 18 },
  orb:         { width: 168, height: 168, borderRadius: 84, justifyContent: 'center', alignItems: 'center' },
  label:       { color: '#f9fafb', fontSize: 17, fontWeight: '600', textAlign: 'center' },
  note:        { color: '#fca5a5', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  transcript:  { flex: 1, marginTop: 24, borderTopWidth: 1, borderTopColor: '#27272a' },
  tLabel:      { color: '#93c5fd', fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  tText:       { color: '#e5e7eb', fontSize: 15, lineHeight: 22 },
  hint:        { color: '#9ca3af', fontSize: 13, marginTop: 8 },
});
