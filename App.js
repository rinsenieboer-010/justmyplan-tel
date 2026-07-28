import 'react-native-url-polyfill/auto';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ActivityIndicator, ScrollView, TouchableOpacity,
  useWindowDimensions, Modal, Alert, Clipboard, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/supabase';
import { DataProvider, useData } from './src/context/DataContext';
import { PERSON_COLOR_KEYS, PERSON_COLORS } from './src/utils';
import LoginScreen from './src/screens/LoginScreen';
import TasksScreen from './src/screens/TasksScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import AIScreen from './src/screens/AIScreen';
import AgentsModal from './src/screens/AgentsModal';
import ImportCalendarModal from './src/screens/ImportCalendarModal';

WebBrowser.maybeCompleteAuthSession();

// ── Schermen ──────────────────────────────────────────────────────────────────
const SCREENS = [
  { name: 'Taken',     color: '#DC2626', Component: TasksScreen },
  { name: 'Agenda',    color: '#E6B400', Component: CalendarScreen },
  { name: 'Assistent', color: '#2563EB', Component: AIScreen },
];

// Loop buffer voor circulaire scroll:
// [screen2, screen0, screen1, screen2, screen0]
// Echte schermen zitten op posities 1, 2, 3 — start op positie 1
const LOOP    = [2, 0, 1, 2, 0];
const START   = 1; // positie 1 = scherm 0 (Taken)

// ── Hoofdpager ────────────────────────────────────────────────────────────────
function MainApp() {
  const insets                      = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const scrollRef                   = useRef(null);
  const isJumping                   = useRef(false);
  const [current, setCurrent]       = useState(0);
  const [showSettings, setShowSettings]     = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [showAgents, setShowAgents]         = useState(false);
  const [showImport, setShowImport]         = useState(false);
  const [apiKey, setApiKey]               = useState(null);
  const [inviteEmail, setInviteEmail]     = useState('');
  const [invitePermission, setInvitePermission] = useState('view');
  const [inviteLists, setInviteLists]     = useState([]); // vooraf gekozen lijsten om te delen
  const [userEmail, setUserEmail]         = useState('');
  const HEADER_H                    = 50;
  const pageH                       = windowHeight - HEADER_H - insets.top - insets.bottom;
  const pageW                       = windowWidth; // horizontaal swipen tussen schermen

  // Deel-state komt uit DataContext (gecentraliseerd)
  const {
    lists, outgoingShares, incomingShares, sharedWithMe, shareListsMap, personColors,
    invitePerson, removeShare, updateSharePermission, acceptInvitation, declineInvitation,
    saveShareLists, setPersonColor, pagerEnabled, setActiveScreen,
    sharedEvents, isSharedVisible, toggleSharedVisible,
  } = useData();

  // Houd de context op de hoogte van het actieve scherm (voor o.a. de agenda-reset)
  useEffect(() => { setActiveScreen(current); }, [current]);

  const ownLists = lists.filter(l => !l.isShared);

  // Welke van mijn lijsten deel ik met deze share aan/uit
  const toggleShareList = (share, listId) => {
    const current = shareListsMap[share.id] || [];
    const nextIds = current.includes(listId) ? current.filter(x => x !== listId) : [...current, listId];
    const objs = ownLists.filter(l => nextIds.includes(l.id)).map(l => ({ id: l.id, label: l.label, color: l.color }));
    saveShareLists(share.id, objs);
  };

  // Unieke lijst van personen waar ik een relatie mee heb (ik→hen of hen→ik)
  const peopleEmails = Array.from(new Set([
    ...outgoingShares.map(s => s.invited_email),
    ...sharedWithMe.map(s => s.owner_email),
  ]));

  // Geselecteerde persoon voor de instellingen-in-instellingen-popup
  const [personModalEmail, setPersonModalEmail] = useState(null);
  const pmOut       = personModalEmail ? outgoingShares.find(s => s.invited_email === personModalEmail) : null;
  const pmSharedIds = pmOut ? (shareListsMap[pmOut.id] || []) : [];
  const pmColor     = personModalEmail ? personColors[personModalEmail] : null;
  // Wat deze persoon met MIJ deelt (ontvangerskant): gedeelde lijsten + evt. agenda
  const pmIncomingLists = personModalEmail ? lists.filter(l => l.isShared && l.ownerEmail === personModalEmail) : [];
  const pmIncomingOwnerId = pmIncomingLists[0]?.ownerId || (personModalEmail ? sharedEvents.find(e => e.ownerEmail === personModalEmail)?.ownerId : null);
  const pmHasIncomingCal = personModalEmail ? sharedEvents.some(e => e.ownerEmail === personModalEmail) : false;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email);
      supabase.from('api_keys').select('key').eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setApiKey(data.key); });
    });
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    const listObjs = ownLists
      .filter(l => inviteLists.includes(l.id))
      .map(l => ({ id: l.id, label: l.label, color: l.color }));
    await invitePerson(inviteEmail, invitePermission, listObjs);
    setInviteEmail('');
    setInviteLists([]);
    setInvitePermission('view');
  };

  const generateApiKey = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const key = 'jmp_' + Array.from({ length: 40 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    await supabase.from('api_keys').upsert({ user_id: user.id, key });
    setApiKey(key);
  };

  // Scroll naar startpositie na mount
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ x: START * pageW, animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, [pageW]);

  const handleScrollEnd = useCallback((e) => {
    if (isJumping.current || pageW === 0) return;
    const x   = e.nativeEvent.contentOffset.x;
    const pos = Math.round(x / pageW);

    if (pos === 0) {
      // Linker kloon (scherm 2) → spring stil naar echte positie 3
      isJumping.current = true;
      scrollRef.current?.scrollTo({ x: 3 * pageW, animated: false });
      setCurrent(2);
      setTimeout(() => { isJumping.current = false; }, 80);
    } else if (pos === 4) {
      // Rechter kloon (scherm 0) → spring stil naar echte positie 1
      isJumping.current = true;
      scrollRef.current?.scrollTo({ x: 1 * pageW, animated: false });
      setCurrent(0);
      setTimeout(() => { isJumping.current = false; }, 80);
    } else {
      setCurrent(LOOP[pos]);
    }
  }, [pageW]);

  return (
    <View style={{ flex: 1, backgroundColor: '#18181b', paddingTop: insets.top, paddingBottom: insets.bottom }}>

      {/* ── Header ── */}
      <View style={{ height: HEADER_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 }}>
        <Text style={{ color: '#f9fafb', fontWeight: '700', fontSize: 16, letterSpacing: 0.5 }}>justmyplan</Text>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: SCREENS[current].color }} />
        <Text style={{ color: '#9ca3af', fontSize: 13, fontWeight: '600' }}>{SCREENS[current].name}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => setShowSettings(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="settings-outline" size={22} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* ── Pager ── */}
      <View style={{ flex: 1 }}>
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={pagerEnabled}
          style={{ flex: 1 }}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
        >
          {LOOP.map((screenIndex, i) => {
            const { Component } = SCREENS[screenIndex];
            return (
              <View key={i} style={{ width: pageW, height: pageH, overflow: 'hidden' }}>
                <Component />
              </View>
            );
          })}
        </ScrollView>

        {/* ── Instellingen modal ── */}
        <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
          <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}
            activeOpacity={1} onPress={() => setShowSettings(false)}>
            <TouchableOpacity activeOpacity={1} style={{ backgroundColor:'#18181b', borderRadius:16, width:320, maxHeight:'88%', overflow:'hidden' }}>

              {/* Header (vast) */}
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:24, paddingTop:24, paddingBottom:16 }}>
                <Text style={{ color:'#f9fafb', fontSize:16, fontWeight:'700' }}>⚙  Instellingen</Text>
                <TouchableOpacity onPress={() => setShowSettings(false)}>
                  <Ionicons name="close" size={22} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ paddingHorizontal:24 }} contentContainerStyle={{ paddingBottom:24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

              {/* Account */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:10 }}>ACCOUNT</Text>
              <View style={{ flexDirection:'row', gap:8, marginBottom:20, alignItems:'stretch' }}>
                <TouchableOpacity
                  onPress={async () => {
                    await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: 'https://justmyplan.com' });
                    Alert.alert('Verstuurd', 'Check je e-mail voor de resetlink.');
                  }}
                  style={{ flex:1, minHeight:46, borderWidth:1, borderColor:'#3f3f46', borderRadius:8, paddingVertical:8, paddingHorizontal:6, alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ color:'#9ca3af', fontSize:13, fontWeight:'600', textAlign:'center' }}>Wachtwoord{'\n'}wijzigen</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { supabase.auth.signOut(); setShowSettings(false); }}
                  style={{ flex:1, minHeight:46, borderWidth:1, borderColor:'#3f3f46', borderRadius:8, paddingVertical:8, paddingHorizontal:6, alignItems:'center', justifyContent:'center' }}>
                  <Text style={{ color:'#f87171', fontSize:13, fontWeight:'600', textAlign:'center' }}>Uitloggen</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height:1, backgroundColor:'#27272a', marginBottom:20 }} />

              {/* ── Delen & connecties ── */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:12 }}>CONNECTIES</Text>

              {/* Uitnodigen: e-mail + knop opent een pop-up met rechten + lijsten */}
              <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                <TextInput
                  style={{ flex:1, backgroundColor:'#111827', borderWidth:1, borderColor:'#3f3f46', borderRadius:6, paddingHorizontal:10, paddingVertical:8, fontSize:12, color:'#f9fafb' }}
                  placeholder="e-mailadres uitnodigen..." placeholderTextColor="#6b7280"
                  value={inviteEmail} onChangeText={setInviteEmail}
                  keyboardType="email-address" autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => inviteEmail.trim() && setInviteModalOpen(true)} disabled={!inviteEmail.trim()}
                  style={{ backgroundColor:'#2563EB', borderRadius:6, paddingHorizontal:14, justifyContent:'center', opacity: inviteEmail.trim() ? 1 : 0.5 }}>
                  <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }}>Uitnodigen</Text>
                </TouchableOpacity>
              </View>

              {/* Verzoeken aan jou (accepteren = tweezijdige connectie) */}
              {incomingShares.length > 0 && (
                <>
                  <Text style={{ fontSize:11, color:'#9ca3af', fontWeight:'700', marginBottom:8 }}>Verzoeken aan jou</Text>
                  {incomingShares.map(s => (
                    <View key={s.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#111827', borderRadius:8, padding:10, marginBottom:6, gap:8 }}>
                      <Ionicons name="person-add-outline" size={16} color="#60a5fa" />
                      <Text style={{ flex:1, fontSize:11, color:'#f9fafb' }} numberOfLines={1}>{s.owner_email}</Text>
                      <TouchableOpacity onPress={() => acceptInvitation(s)}
                        style={{ backgroundColor:'#166534', borderRadius:6, paddingHorizontal:10, paddingVertical:5 }}>
                        <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Accepteren</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => declineInvitation(s.id)} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                        <Ionicons name="close" size={18} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  <View style={{ height:14 }} />
                </>
              )}

              {/* Je connecties */}
              <Text style={{ fontSize:11, color:'#9ca3af', fontWeight:'700', marginBottom:8 }}>Je connecties</Text>
              {peopleEmails.length === 0 ? (
                <Text style={{ fontSize:12, color:'#3f3f46', marginBottom:10 }}>Nog geen connecties. Nodig iemand uit via e-mail.</Text>
              ) : peopleEmails.map(email => {
                const out = outgoingShares.find(s => s.invited_email === email);
                const myColor = personColors[email];
                const dot = myColor ? PERSON_COLORS[myColor].dot : '#3f3f46';
                const subtitle = out ? (out.status === 'accepted' ? 'tik om in te stellen' : 'verzoek verstuurd') : 'gedeeld met jou';
                return (
                  <TouchableOpacity key={email} onPress={() => setPersonModalEmail(email)}
                    style={{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#111827', borderRadius:8, padding:12, marginBottom:8 }}>
                    <View style={{ width:14, height:14, borderRadius:7, backgroundColor: dot, borderWidth: myColor ? 0 : 1, borderColor:'#3f3f46' }} />
                    <View style={{ flex:1, minWidth:0 }}>
                      <Text style={{ color:'#f9fafb', fontSize:12, fontWeight:'600' }} numberOfLines={1}>{email}</Text>
                      <Text style={{ color:'#6b7280', fontSize:10, marginTop:1 }}>{subtitle}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                  </TouchableOpacity>
                );
              })}

              <View style={{ height:1, backgroundColor:'#27272a', marginVertical:20 }} />

              {/* Agenda importeren */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:10 }}>AGENDA</Text>
              <TouchableOpacity onPress={() => { setShowSettings(false); setShowImport(true); }}
                style={{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#111827', borderRadius:8, padding:12, marginBottom:20 }}>
                <Text style={{ fontSize:18 }}>📥</Text>
                <View style={{ flex:1 }}>
                  <Text style={{ color:'#f9fafb', fontSize:13, fontWeight:'600' }}>Agenda importeren</Text>
                  <Text style={{ color:'#6b7280', fontSize:11, marginTop:1 }}>Apple of Google Agenda in één keer overzetten</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6b7280" />
              </TouchableOpacity>

              <View style={{ height:1, backgroundColor:'#27272a', marginBottom:20 }} />

              {/* Agent Management */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:10 }}>AGENTS</Text>
              <TouchableOpacity onPress={() => { setShowSettings(false); setShowAgents(true); }}
                style={{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor:'#111827', borderRadius:8, padding:12, marginBottom:20 }}>
                <Text style={{ fontSize:18 }}>⚡</Text>
                <View style={{ flex:1 }}>
                  <Text style={{ color:'#f9fafb', fontSize:13, fontWeight:'600' }}>Agent Management</Text>
                  <Text style={{ color:'#6b7280', fontSize:11, marginTop:1 }}>Stuur een bericht naar je agents</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#6b7280" />
              </TouchableOpacity>

              <View style={{ height:1, backgroundColor:'#27272a', marginBottom:20 }} />

              {/* API */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:10 }}>API TOEGANG</Text>
              <Text style={{ fontSize:12, color:'#6b7280', marginBottom:12, lineHeight:18 }}>
                Gebruik je API key om je data op te vragen vanuit andere apps of Claude.
              </Text>

              <Text style={{ fontSize:10, color:'#6b7280', marginBottom:4 }}>API Key</Text>
              {apiKey ? (
                <>
                  <View style={{ backgroundColor:'#111827', borderRadius:6, padding:8, marginBottom:8 }}>
                    <Text style={{ fontSize:10, color:'#60a5fa', fontFamily:'monospace' }} numberOfLines={2}>{apiKey}</Text>
                  </View>
                  <View style={{ flexDirection:'row', gap:8 }}>
                    <TouchableOpacity onPress={() => { Clipboard.setString(apiKey); Alert.alert('Gekopieerd!'); }}
                      style={{ flex:1, borderWidth:1, borderColor:'#3f3f46', borderRadius:6, paddingVertical:8, alignItems:'center' }}>
                      <Text style={{ color:'#f9fafb', fontSize:12 }}>Kopieer</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={generateApiKey}
                      style={{ flex:1, backgroundColor:'#27272a', borderRadius:6, paddingVertical:8, alignItems:'center' }}>
                      <Text style={{ color:'#9ca3af', fontSize:12 }}>Vernieuwen</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <TouchableOpacity onPress={generateApiKey}
                  style={{ backgroundColor:'#2563EB', borderRadius:8, paddingVertical:11, alignItems:'center' }}>
                  <Text style={{ color:'#fff', fontSize:13, fontWeight:'600' }}>Genereer API key</Text>
                </TouchableOpacity>
              )}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
          {/* Persoon-overlay (binnen de instellingen-Modal — iOS toont maar één Modal tegelijk) */}
          {personModalEmail && (
            <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
              <TouchableOpacity activeOpacity={1} onPress={() => setPersonModalEmail(null)} style={{ position:'absolute', top:0, left:0, right:0, bottom:0 }} />
              <View style={{ backgroundColor:'#18181b', borderRadius:16, width:320, maxHeight:'85%', padding:24 }}>
                <View style={{ flexDirection:'row', alignItems:'center', marginBottom:18 }}>
                  <Text style={{ flex:1, color:'#f9fafb', fontSize:14, fontWeight:'700', marginRight:8 }} numberOfLines={1}>{personModalEmail}</Text>
                  <TouchableOpacity onPress={() => setPersonModalEmail(null)}>
                    <Ionicons name="close" size={22} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {/* Kleur */}
                  <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:10 }}>KLEUR</Text>
                  <View style={{ flexDirection:'row', gap:12, marginBottom:22 }}>
                    {PERSON_COLOR_KEYS.map(key => (
                      <TouchableOpacity key={key}
                        onPress={() => setPersonColor(personModalEmail, pmColor === key ? null : key)}
                        style={{ width:30, height:30, borderRadius:15, backgroundColor: PERSON_COLORS[key].dot, borderWidth: pmColor === key ? 3 : 0, borderColor:'#f9fafb' }} />
                    ))}
                  </View>

                  {/* Wat JIJ deelt met deze connectie */}
                  {pmOut && (
                    <>
                      <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:6 }}>
                        WAT JIJ DEELT MET {(personModalEmail || '').split('@')[0].toUpperCase()}
                      </Text>
                      {ownLists.map(l => {
                        const on = pmSharedIds.includes(l.id);
                        return (
                          <TouchableOpacity key={l.id} onPress={() => toggleShareList(pmOut, l.id)}
                            style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:11, borderBottomWidth:1, borderBottomColor:'#27272a' }}>
                            <View style={{ width:10, height:10, borderRadius:5, backgroundColor:l.color }} />
                            <Text style={{ flex:1, color:'#f9fafb', fontSize:14 }}>{l.label}</Text>
                            <View style={{ width:24, height:24, borderRadius:6, borderWidth:2, borderColor: on ? '#2563EB' : '#3f3f46', backgroundColor: on ? '#2563EB' : 'transparent', justifyContent:'center', alignItems:'center' }}>
                              {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                      {ownLists.length === 0 && <Text style={{ fontSize:12, color:'#3f3f46' }}>Je hebt nog geen eigen lijsten.</Text>}

                      <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginTop:18, marginBottom:8 }}>RECHTEN</Text>
                      <View style={{ flexDirection:'row', gap:8 }}>
                        {[['view','👁  Bekijken'], ['edit','✏️  Bewerken']].map(([p, label]) => (
                          <TouchableOpacity key={p} onPress={() => updateSharePermission(pmOut.id, p)}
                            style={{ flex:1, borderWidth:1, borderColor: pmOut.permission === p ? '#2563EB' : '#3f3f46', backgroundColor: pmOut.permission === p ? '#1e3a8a' : 'transparent', borderRadius:8, paddingVertical:10, alignItems:'center' }}>
                            <Text style={{ color: pmOut.permission === p ? '#fff' : '#9ca3af', fontSize:12, fontWeight:'600' }}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  {/* Wat DEZE PERSOON met jou deelt (zichtbaarheid) */}
                  {(pmIncomingLists.length > 0 || pmHasIncomingCal) && (
                    <>
                      <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginTop: pmOut ? 22 : 0, marginBottom:6 }}>
                        WAT {(personModalEmail || '').split('@')[0].toUpperCase()} MET JOU DEELT
                      </Text>
                      {pmIncomingLists.map(l => {
                        const on = isSharedVisible(l.id);
                        return (
                          <TouchableOpacity key={l.id} onPress={() => toggleSharedVisible(l.id)}
                            style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:11, borderBottomWidth:1, borderBottomColor:'#27272a' }}>
                            <View style={{ width:10, height:10, borderRadius:5, backgroundColor:l.color }} />
                            <Text style={{ flex:1, color:'#f9fafb', fontSize:14 }} numberOfLines={1}>{l.label}</Text>
                            <Ionicons name={on ? 'eye' : 'eye-off'} size={20} color={on ? '#2563EB' : '#3f3f46'} />
                          </TouchableOpacity>
                        );
                      })}
                      {pmHasIncomingCal && pmIncomingOwnerId && (() => {
                        const on = isSharedVisible('cal:' + pmIncomingOwnerId);
                        return (
                          <TouchableOpacity onPress={() => toggleSharedVisible('cal:' + pmIncomingOwnerId)}
                            style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:11, borderBottomWidth:1, borderBottomColor:'#27272a' }}>
                            <Ionicons name="calendar-outline" size={13} color="#9ca3af" />
                            <Text style={{ flex:1, color:'#f9fafb', fontSize:14 }}>Agenda (afspraken)</Text>
                            <Ionicons name={on ? 'eye' : 'eye-off'} size={20} color={on ? '#2563EB' : '#3f3f46'} />
                          </TouchableOpacity>
                        );
                      })()}
                      <Text style={{ fontSize:11, color:'#6b7280', marginTop:10, lineHeight:16 }}>
                        Tik op het oog om iets voor jezelf te tonen of te verbergen. Dit verandert niets voor de ander.
                      </Text>
                    </>
                  )}

                  {!pmOut && pmIncomingLists.length === 0 && !pmHasIncomingCal && (
                    <Text style={{ fontSize:12, color:'#9ca3af', lineHeight:18 }}>
                      Nog niks gedeeld tussen jullie. Geef een kleur, of nodig 'm uit om een connectie te maken.
                    </Text>
                  )}

                  {pmOut && (
                    <TouchableOpacity onPress={() => { removeShare(pmOut.id); setPersonModalEmail(null); }}
                      style={{ borderWidth:1, borderColor:'#7f1d1d', borderRadius:8, paddingVertical:11, alignItems:'center', marginTop:22 }}>
                      <Text style={{ color:'#f87171', fontSize:13, fontWeight:'600' }}>Stop met delen</Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>
              </View>
            </View>
          )}

          {/* Uitnodig-overlay (binnen de instellingen-Modal) */}
          {inviteModalOpen && (
            <View style={{ position:'absolute', top:0, left:0, right:0, bottom:0, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}>
              <TouchableOpacity activeOpacity={1} onPress={() => setInviteModalOpen(false)} style={{ position:'absolute', top:0, left:0, right:0, bottom:0 }} />
              <View style={{ backgroundColor:'#18181b', borderRadius:16, width:320, maxHeight:'85%', padding:24 }}>
                <View style={{ flexDirection:'row', alignItems:'center', marginBottom:16 }}>
                  <Text style={{ flex:1, color:'#f9fafb', fontSize:14, fontWeight:'700', marginRight:8 }} numberOfLines={1}>Uitnodigen: {inviteEmail.trim()}</Text>
                  <TouchableOpacity onPress={() => setInviteModalOpen(false)}>
                    <Ionicons name="close" size={22} color="#9ca3af" />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:8 }}>RECHTEN</Text>
                  <View style={{ flexDirection:'row', gap:8, marginBottom:16 }}>
                    {[['view','👁  Bekijken'], ['edit','✏️  Bewerken']].map(([p, label]) => (
                      <TouchableOpacity key={p} onPress={() => setInvitePermission(p)}
                        style={{ flex:1, borderWidth:1, borderColor: invitePermission === p ? '#2563EB' : '#3f3f46', backgroundColor: invitePermission === p ? '#1e3a8a' : 'transparent', borderRadius:8, paddingVertical:9, alignItems:'center' }}>
                        <Text style={{ color: invitePermission === p ? '#fff' : '#9ca3af', fontSize:12, fontWeight:'600' }}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:8 }}>WELKE LIJSTEN DEEL JE</Text>
                  {ownLists.length === 0 ? (
                    <Text style={{ fontSize:12, color:'#3f3f46', marginBottom:12 }}>Je hebt nog geen eigen lijsten.</Text>
                  ) : (
                    <View style={{ marginBottom:12 }}>
                      {ownLists.map(l => {
                        const on = inviteLists.includes(l.id);
                        return (
                          <TouchableOpacity key={l.id}
                            onPress={() => setInviteLists(prev => prev.includes(l.id) ? prev.filter(x => x !== l.id) : [...prev, l.id])}
                            style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#27272a' }}>
                            <View style={{ width:10, height:10, borderRadius:5, backgroundColor:l.color }} />
                            <Text style={{ flex:1, color:'#f9fafb', fontSize:14 }} numberOfLines={1}>{l.label}</Text>
                            <View style={{ width:24, height:24, borderRadius:6, borderWidth:2, borderColor: on ? '#2563EB' : '#3f3f46', backgroundColor: on ? '#2563EB' : 'transparent', justifyContent:'center', alignItems:'center' }}>
                              {on && <Ionicons name="checkmark" size={16} color="#fff" />}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <Text style={{ fontSize:11, color:'#6b7280', marginTop:8, marginBottom:16, lineHeight:16 }}>
                    Dit is een verzoek. Zodra de ander accepteert, ontstaat een tweezijdige connectie.
                  </Text>

                  <TouchableOpacity onPress={async () => { await handleInvite(); setInviteModalOpen(false); }}
                    style={{ backgroundColor:'#2563EB', borderRadius:8, paddingVertical:12, alignItems:'center' }}>
                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>Verzoek versturen</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </View>
          )}
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Agent Management modal ── */}
        <AgentsModal visible={showAgents} onClose={() => setShowAgents(false)} />

        {/* ── Apple Agenda import modal ── */}
        <ImportCalendarModal visible={showImport} onClose={() => setShowImport(false)} />

        {/* ── Positie-indicator (onder, horizontaal) ── */}
        <View style={{ position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8, pointerEvents: 'none' }}>
          {SCREENS.map((sc, i) => (
            <View key={i} style={{
              width:  current === i ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: current === i ? sc.color : '#3f3f46',
            }} />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [session,     setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (authLoading) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: '#18181b', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color="#2563EB" size="large" />
        </View>
      </SafeAreaProvider>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <LoginScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <DataProvider userId={session.user.id}>
        <MainApp />
      </DataProvider>
    </SafeAreaProvider>
  );
}
