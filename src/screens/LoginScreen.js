import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const [mode, setMode]         = useState('login'); // 'login' | 'signup' | 'forgot'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
    }
  }, []);

  const switchMode = (m) => { setMode(m); setSuccess(null); };

  // Native Sign in with Apple: identity token direct naar Supabase (geen browser).
  const handleApple = async () => {
    setLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (credential.identityToken) {
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        });
        if (error) Alert.alert('Fout', error.message);
      }
    } catch (e) {
      if (e.code !== 'ERR_REQUEST_CANCELED') Alert.alert('Fout', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmail = async () => {
    if (mode === 'forgot') {
      if (!email.trim()) { Alert.alert('Vul je e-mailadres in'); return; }
      setLoading(true);
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: 'https://justmyplan.com/',
        });
        if (error) Alert.alert('Fout', error.message);
        else setSuccess('Check je e-mail voor de resetlink.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!email.trim() || !password.trim()) {
      Alert.alert('Vul alle velden in');
      return;
    }
    setLoading(true);
    try {
      let error;
      if (mode === 'login') {
        ({ error } = await supabase.auth.signInWithPassword({ email: email.trim(), password }));
      } else {
        ({ error } = await supabase.auth.signUp({ email: email.trim(), password }));
      }
      if (error) Alert.alert('Fout', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider) => {
    setLoading(true);
    try {
      const redirectUri = Linking.createURL('/');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: redirectUri, skipBrowserRedirect: true },
      });
      if (error) { Alert.alert('Fout', error.message); return; }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUri);
      if (result.type === 'success' && result.url) {
        const hashIndex = result.url.indexOf('#');
        if (hashIndex !== -1) {
          const hashParams = new URLSearchParams(result.url.slice(hashIndex + 1));
          const access_token  = hashParams.get('access_token');
          const refresh_token = hashParams.get('refresh_token');
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Logo */}
        <View style={s.logoRow}>
          <Text style={s.logoText}>justmyplan</Text>
          <View style={[s.dot, { backgroundColor: '#DC2626' }]} />
          <View style={[s.dot, { backgroundColor: '#E6B400' }]} />
          <View style={[s.dot, { backgroundColor: '#2563EB' }]} />
        </View>

        {/* Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>
            {mode === 'login' ? 'Inloggen' : mode === 'signup' ? 'Account aanmaken' : 'Wachtwoord vergeten'}
          </Text>

          {mode !== 'forgot' && <>
            {appleAvailable && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={8}
                style={s.appleBtn}
                onPress={handleApple}
              />
            )}
            <TouchableOpacity style={s.oauthBtn} onPress={() => handleOAuth('google')} disabled={loading}>
              <Text style={s.oauthIcon}>G</Text>
              <Text style={s.oauthText}>Doorgaan met Google</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.oauthBtn} onPress={() => handleOAuth('azure')} disabled={loading}>
              <Text style={s.oauthIcon}>M</Text>
              <Text style={s.oauthText}>Doorgaan met Microsoft</Text>
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.dividerLine} />
              <Text style={s.dividerLabel}>of</Text>
              <View style={s.dividerLine} />
            </View>
          </>}

          <TextInput
            style={s.input}
            placeholder="E-mailadres"
            placeholderTextColor="#6b7280"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          {mode !== 'forgot' && (
            <TextInput
              style={s.input}
              placeholder="Wachtwoord (min. 6 tekens)"
              placeholderTextColor="#6b7280"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          )}

          {mode === 'login' && (
            <TouchableOpacity onPress={() => switchMode('forgot')} style={{ alignSelf: 'flex-end', marginBottom: 12, marginTop: -4 }}>
              <Text style={s.forgotLink}>Wachtwoord vergeten?</Text>
            </TouchableOpacity>
          )}

          {success ? (
            <Text style={s.successText}>{success}</Text>
          ) : (
            <TouchableOpacity style={[s.submitBtn, loading && s.btnDisabled]} onPress={handleEmail} disabled={loading}>
              <Text style={s.submitText}>
                {loading ? 'Laden...' : mode === 'login' ? 'Inloggen' : mode === 'signup' ? 'Account aanmaken' : 'Resetlink sturen'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={s.toggleRow}>
            {mode === 'forgot' ? (
              <TouchableOpacity onPress={() => switchMode('login')}>
                <Text style={s.toggleLink}>Terug naar inloggen</Text>
              </TouchableOpacity>
            ) : mode === 'login' ? <>
              <Text style={s.toggleLabel}>Nog geen account? </Text>
              <TouchableOpacity onPress={() => switchMode('signup')}>
                <Text style={s.toggleLink}>Aanmaken</Text>
              </TouchableOpacity>
            </> : <>
              <Text style={s.toggleLabel}>Al een account? </Text>
              <TouchableOpacity onPress={() => switchMode('login')}>
                <Text style={s.toggleLink}>Inloggen</Text>
              </TouchableOpacity>
            </>}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#111827' },
  scroll:       { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  logoRow:      { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 40 },
  logoText:     { fontSize: 24, fontWeight: '700', color: '#f9fafb', letterSpacing: 0.5 },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  card:         { backgroundColor: '#18181b', borderRadius: 16, padding: 28, width: '100%', maxWidth: 400 },
  cardTitle:    { color: '#f9fafb', fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  appleBtn:     { height: 44, marginBottom: 10 },
  oauthBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#27272a', borderRadius: 8, borderWidth: 1, borderColor: '#3f3f46', paddingVertical: 12, marginBottom: 10, gap: 8 },
  oauthIcon:    { color: '#f9fafb', fontSize: 15, fontWeight: '700', width: 20, textAlign: 'center' },
  oauthText:    { color: '#f9fafb', fontSize: 14, fontWeight: '500' },
  divider:      { flexDirection: 'row', alignItems: 'center', marginVertical: 16 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: '#3f3f46' },
  dividerLabel: { color: '#71717a', fontSize: 12, marginHorizontal: 10 },
  input:        { backgroundColor: '#27272a', borderRadius: 8, borderWidth: 1, borderColor: '#3f3f46', color: '#f9fafb', fontSize: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  forgotLink:   { color: '#60a5fa', fontSize: 12 },
  submitBtn:    { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnDisabled:  { opacity: 0.7 },
  submitText:   { color: '#fff', fontSize: 14, fontWeight: '600' },
  successText:  { color: '#86efac', fontSize: 13, textAlign: 'center', marginVertical: 8 },
  toggleRow:    { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  toggleLabel:  { color: '#71717a', fontSize: 13 },
  toggleLink:   { color: '#60a5fa', fontSize: 13, fontWeight: '500' },
});
