import 'react-native-url-polyfill/auto';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, ActivityIndicator, ScrollView, TouchableOpacity,
  useWindowDimensions, Modal, Alert, Clipboard, TextInput,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './src/supabase';
import { DataProvider } from './src/context/DataContext';
import LoginScreen from './src/screens/LoginScreen';
import TasksScreen from './src/screens/TasksScreen';
import CalendarScreen from './src/screens/CalendarScreen';
import AIScreen from './src/screens/AIScreen';

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
  const { height: windowHeight }    = useWindowDimensions();
  const scrollRef                   = useRef(null);
  const isJumping                   = useRef(false);
  const [current, setCurrent]       = useState(0);
  const [showSettings, setShowSettings]     = useState(false);
  const [apiKey, setApiKey]               = useState(null);
  const [outgoingShares, setOutgoingShares] = useState([]);
  const [incomingShares, setIncomingShares] = useState([]);
  const [inviteEmail, setInviteEmail]     = useState('');
  const [invitePermission, setInvitePermission] = useState('view');
  const [userEmail, setUserEmail]         = useState('');
  const HEADER_H                    = 50;
  const pageH                       = windowHeight - HEADER_H - insets.top - insets.bottom;

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUserEmail(user.email);
      supabase.from('api_keys').select('key').eq('user_id', user.id).single()
        .then(({ data }) => { if (data) setApiKey(data.key); });
    });
  }, []);

  useEffect(() => {
    if (!showSettings || !userEmail) return;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('shares').select('*').eq('owner_id', user.id)
        .then(({ data }) => setOutgoingShares(data || []));
      supabase.from('shares').select('*').eq('invited_email', user.email).eq('status', 'pending')
        .then(({ data }) => setIncomingShares(data || []));
    });
  }, [showSettings, userEmail]);

  const invitePerson = async () => {
    if (!inviteEmail.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const email = inviteEmail.trim().toLowerCase();
    const { data, error } = await supabase.from('shares').insert({
      owner_id: user.id, owner_email: user.email,
      invited_email: email, permission: invitePermission,
    }).select().single();
    if (!error && data) { setOutgoingShares(s => [...s, data]); setInviteEmail(''); }
  };

  const removeShare = async (id) => {
    await supabase.from('shares').delete().eq('id', id);
    setOutgoingShares(s => s.filter(x => x.id !== id));
  };

  const updateSharePermission = async (id, permission) => {
    await supabase.from('shares').update({ permission }).eq('id', id);
    setOutgoingShares(s => s.map(x => x.id === id ? { ...x, permission } : x));
  };

  const acceptInvitation = async (id) => {
    await supabase.from('shares').update({ status: 'accepted' }).eq('id', id);
    setIncomingShares(s => s.filter(x => x.id !== id));
  };

  const declineInvitation = async (id) => {
    await supabase.from('shares').update({ status: 'declined' }).eq('id', id);
    setIncomingShares(s => s.filter(x => x.id !== id));
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
      scrollRef.current?.scrollTo({ y: START * pageH, animated: false });
    }, 100);
    return () => clearTimeout(t);
  }, [pageH]);

  const handleScrollEnd = useCallback((e) => {
    if (isJumping.current || pageH === 0) return;
    const y   = e.nativeEvent.contentOffset.y;
    const pos = Math.round(y / pageH);

    if (pos === 0) {
      // Bovenste kloon (scherm 2) → spring stil naar echte positie 3
      isJumping.current = true;
      scrollRef.current?.scrollTo({ y: 3 * pageH, animated: false });
      setCurrent(2);
      setTimeout(() => { isJumping.current = false; }, 80);
    } else if (pos === 4) {
      // Onderste kloon (scherm 0) → spring stil naar echte positie 1
      isJumping.current = true;
      scrollRef.current?.scrollTo({ y: 1 * pageH, animated: false });
      setCurrent(0);
      setTimeout(() => { isJumping.current = false; }, 80);
    } else {
      setCurrent(LOOP[pos]);
    }
  }, [pageH]);

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
          style={{ flex: 1 }}
          snapToInterval={pageH}
          snapToAlignment="start"
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          onMomentumScrollEnd={handleScrollEnd}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
        >
          {LOOP.map((screenIndex, i) => {
            const { Component } = SCREENS[screenIndex];
            return (
              <View key={i} style={{ height: pageH, overflow: 'hidden' }}>
                <Component />
              </View>
            );
          })}
        </ScrollView>

        {/* ── Instellingen modal ── */}
        <Modal visible={showSettings} transparent animationType="fade" onRequestClose={() => setShowSettings(false)}>
          <TouchableOpacity style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'center', alignItems:'center' }}
            activeOpacity={1} onPress={() => setShowSettings(false)}>
            <TouchableOpacity activeOpacity={1} style={{ backgroundColor:'#18181b', borderRadius:16, width:320, padding:24 }}>

              {/* Header */}
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <Text style={{ color:'#f9fafb', fontSize:16, fontWeight:'700' }}>⚙  Instellingen</Text>
                <TouchableOpacity onPress={() => setShowSettings(false)}>
                  <Ionicons name="close" size={22} color="#9ca3af" />
                </TouchableOpacity>
              </View>

              {/* Account */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:10 }}>ACCOUNT</Text>
              <View style={{ flexDirection:'row', gap:8, marginBottom:20 }}>
                <TouchableOpacity
                  onPress={async () => {
                    await supabase.auth.resetPasswordForEmail(userEmail, { redirectTo: 'https://justmyplan.com' });
                    Alert.alert('Verstuurd', 'Check je e-mail voor de resetlink.');
                  }}
                  style={{ flex:1, borderWidth:1, borderColor:'#3f3f46', borderRadius:8, paddingVertical:10, alignItems:'center' }}>
                  <Text style={{ color:'#9ca3af', fontSize:13, fontWeight:'600' }}>Wachtwoord wijzigen</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { supabase.auth.signOut(); setShowSettings(false); }}
                  style={{ flex:1, borderWidth:1, borderColor:'#3f3f46', borderRadius:8, paddingVertical:10, alignItems:'center' }}>
                  <Text style={{ color:'#f87171', fontSize:13, fontWeight:'600' }}>Uitloggen</Text>
                </TouchableOpacity>
              </View>

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

              <View style={{ height:1, backgroundColor:'#27272a', marginVertical:20 }} />

              {/* ── Delen ── */}
              <Text style={{ fontSize:10, color:'#6b7280', fontWeight:'700', letterSpacing:1, marginBottom:12 }}>DELEN</Text>

              <Text style={{ fontSize:12, color:'#9ca3af', fontWeight:'600', marginBottom:8 }}>Gedeeld door mij</Text>
              {outgoingShares.length === 0 && (
                <Text style={{ fontSize:12, color:'#3f3f46', marginBottom:10 }}>Nog niemand uitgenodigd</Text>
              )}
              {outgoingShares.map(s => (
                <View key={s.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#111827', borderRadius:8, padding:10, marginBottom:6, gap:6 }}>
                  <Text style={{ flex:1, fontSize:11, color:'#9ca3af' }} numberOfLines={1}>{s.invited_email}</Text>
                  <Text style={{ fontSize:10, color: s.status === 'accepted' ? '#4ade80' : '#6b7280' }}>
                    {s.status === 'accepted' ? 'actief' : 'wacht...'}
                  </Text>
                  <TouchableOpacity onPress={() => updateSharePermission(s.id, s.permission === 'view' ? 'edit' : 'view')}
                    style={{ backgroundColor:'#27272a', borderRadius:6, padding:6 }}>
                    <Text style={{ fontSize:14 }}>{s.permission === 'view' ? '👁' : '✏️'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => removeShare(s.id)}>
                    <Ionicons name="close" size={16} color="#6b7280" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Uitnodigen */}
              <View style={{ flexDirection:'row', gap:6, marginTop:8 }}>
                <TextInput
                  style={{ flex:1, backgroundColor:'#111827', borderWidth:1, borderColor:'#3f3f46', borderRadius:6, paddingHorizontal:10, paddingVertical:7, fontSize:12, color:'#f9fafb' }}
                  placeholder="e-mailadres..." placeholderTextColor="#6b7280"
                  value={inviteEmail} onChangeText={setInviteEmail}
                  keyboardType="email-address" autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setInvitePermission(p => p === 'view' ? 'edit' : 'view')}
                  style={{ backgroundColor:'#27272a', borderRadius:6, paddingHorizontal:10, justifyContent:'center' }}>
                  <Text style={{ fontSize:14 }}>{invitePermission === 'view' ? '👁' : '✏️'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={invitePerson}
                  style={{ backgroundColor:'#2563EB', borderRadius:6, paddingHorizontal:12, justifyContent:'center' }}>
                  <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }}>Uitnodigen</Text>
                </TouchableOpacity>
              </View>

              {/* Binnenkomende uitnodigingen */}
              {incomingShares.length > 0 && (
                <>
                  <View style={{ height:1, backgroundColor:'#27272a', marginVertical:14 }} />
                  <Text style={{ fontSize:12, color:'#9ca3af', fontWeight:'600', marginBottom:8 }}>Uitnodigingen</Text>
                  {incomingShares.map(s => (
                    <View key={s.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#111827', borderRadius:8, padding:10, marginBottom:6, gap:8 }}>
                      <Text style={{ fontSize:14 }}>{s.permission === 'view' ? '👁' : '✏️'}</Text>
                      <Text style={{ flex:1, fontSize:11, color:'#9ca3af' }} numberOfLines={1}>{s.owner_email}</Text>
                      <TouchableOpacity onPress={() => acceptInvitation(s.id)}
                        style={{ backgroundColor:'#166534', borderRadius:6, paddingHorizontal:8, paddingVertical:4 }}>
                        <Text style={{ color:'#4ade80', fontSize:12 }}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => declineInvitation(s.id)}>
                        <Ionicons name="close" size={16} color="#6b7280" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* ── Positie-indicator (rechts) ── */}
        <View style={{ position: 'absolute', right: 10, top: '50%', marginTop: -26, gap: 8, pointerEvents: 'none' }}>
          {SCREENS.map((sc, i) => (
            <View key={i} style={{
              width:  current === i ? 8 : 5,
              height: current === i ? 8 : 5,
              borderRadius: 4,
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
