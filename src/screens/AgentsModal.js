import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../supabase';
import { loadAgents, addAgentDB, updateAgentDB, deleteAgentDB } from '../db';
import { MODEL_BADGE_COLOR, MODEL_OPTIONS, AGENT_EMOJI_CHOICES, AGENT_RUN_URL } from '../agents';

export default function AgentsModal({ visible, onClose }) {
  const [uid, setUid]         = useState(null);
  const [agents, setAgents]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState('list'); // 'list' | 'chat' | 'edit'

  // chat
  const [selected, setSelected] = useState(null);
  const [input, setInput]       = useState('');
  const [running, setRunning]   = useState(false);
  const [reply, setReply]       = useState(null);

  // edit/create
  const [editing, setEditing] = useState(null); // null = new
  const [name, setName]       = useState('');
  const [emoji, setEmoji]     = useState('🤖');
  const [model, setModel]     = useState('sonnet');
  const [role, setRole]       = useState('');
  const [prompt, setPrompt]   = useState('');

  const reload = useCallback(async (userId) => {
    setLoading(true);
    const list = await loadAgents(userId);
    setAgents(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    setView('list'); setSelected(null); setReply(null); setInput('');
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      setUid(user.id);
      reload(user.id);
    });
  }, [visible, reload]);

  const openEdit = (a) => {
    setEditing(a); setName(a.name || ''); setEmoji(a.emoji || '🤖');
    setModel(a.model || 'sonnet'); setRole(a.role || ''); setPrompt(a.system_prompt || '');
    setView('edit');
  };
  const saveAgent = async () => {
    if (!name.trim()) { Alert.alert('Geef de agent een naam'); return; }
    const payload = { name: name.trim(), emoji, model, role: role.trim(), system_prompt: prompt.trim() };
    if (editing?.id) await updateAgentDB({ ...payload, id: editing.id });
    else await addAgentDB(uid, payload);
    await reload(uid);
    setView('list');
  };
  const removeAgent = () => {
    if (!editing?.id) { setView('list'); return; }
    Alert.alert('Agent verwijderen', `"${editing.name}" verwijderen?`, [
      { text: 'Annuleer', style: 'cancel' },
      { text: 'Verwijderen', style: 'destructive', onPress: async () => { await deleteAgentDB(editing.id); await reload(uid); setView('list'); } },
    ]);
  };

  const openChat = (a) => { setSelected(a); setReply(null); setInput(''); setView('chat'); };
  const trigger = async () => {
    if (!selected || !input.trim()) return;
    setRunning(true); setReply(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(AGENT_RUN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ agent_id: selected.id, message: input.trim() }),
      });
      const data = await res.json();
      setReply(data.reply || data.error || 'Geen response');
    } catch (err) {
      setReply('Fout: ' + err.message);
    }
    setRunning(false);
  };

  const close = () => { setView('list'); setSelected(null); onClose(); };
  const headerTitle = view === 'chat' ? (selected?.name || 'Agent')
    : view === 'edit' ? (editing ? 'Agent bewerken' : 'Nieuwe agent')
    : '⚡ Agent Management';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={s.container}>
        <View style={s.header}>
          {view !== 'list' ? (
            <TouchableOpacity onPress={() => setView('list')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={24} color="#f9fafb" />
            </TouchableOpacity>
          ) : <View style={{ width: 24 }} />}
          <Text style={s.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={24} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        {/* ── LIJST ── */}
        {view === 'list' && (
          loading ? (
            <View style={s.center}><ActivityIndicator color="#2563EB" /></View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
              {agents.length === 0 && (
                <View style={s.empty}>
                  <Text style={{ fontSize: 36 }}>🤖</Text>
                  <Text style={s.emptyText}>Nog geen agents. Voeg ze toe via je API-key — geef je JMP-key aan een AI (ChatGPT, Gemini) en laat die de agents aanmaken. De key vind je in de instellingen op justmyplan.com.</Text>
                </View>
              )}
              {agents.map(a => (
                <View key={a.id} style={s.agentRow}>
                  <TouchableOpacity style={s.agentMain} onPress={() => openChat(a)}>
                    <Text style={s.agentEmoji}>{a.emoji || '🤖'}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={s.agentName} numberOfLines={1}>{a.name}</Text>
                      {!!a.role && <Text style={s.agentRole} numberOfLines={1}>{a.role}</Text>}
                    </View>
                    <View style={[s.modelBadge, { backgroundColor: MODEL_BADGE_COLOR[a.model] || '#374151' }]}>
                      <Text style={s.modelBadgeText}>{(a.model || 'sonnet').toUpperCase()}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openEdit(a)} style={s.editBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="pencil" size={16} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          )
        )}

        {/* ── BEWERKEN / AANMAKEN ── */}
        {view === 'edit' && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={20}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <Text style={s.label}>Naam</Text>
              <TextInput style={s.field} value={name} onChangeText={setName} placeholder="Bijv. Boodschapper" placeholderTextColor="#6b7280" />

              <Text style={s.label}>Emoji</Text>
              <View style={s.emojiRow}>
                {AGENT_EMOJI_CHOICES.map(e => (
                  <TouchableOpacity key={e} onPress={() => setEmoji(e)} style={[s.emojiBtn, emoji === e && s.emojiBtnOn]}>
                    <Text style={{ fontSize: 20 }}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Model</Text>
              <View style={s.modelRow}>
                {MODEL_OPTIONS.map(([val, lbl]) => (
                  <TouchableOpacity key={val} onPress={() => setModel(val)}
                    style={[s.modelOpt, model === val && { backgroundColor: MODEL_BADGE_COLOR[val], borderColor: MODEL_BADGE_COLOR[val] }]}>
                    <Text style={[s.modelOptText, model === val && { color: '#fff' }]}>{lbl}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.label}>Rol (kort)</Text>
              <TextInput style={s.field} value={role} onChangeText={setRole} placeholder="Bijv. houdt je boodschappenlijst bij" placeholderTextColor="#6b7280" />

              <Text style={s.label}>System prompt (hoe gedraagt de agent zich)</Text>
              <TextInput style={[s.field, s.fieldMulti]} value={prompt} onChangeText={setPrompt} multiline
                placeholder="Je bent ... Antwoord kort en in het Nederlands." placeholderTextColor="#6b7280" />

              <TouchableOpacity style={s.saveBtn} onPress={saveAgent}>
                <Text style={s.saveBtnText}>{editing ? 'Opslaan' : 'Aanmaken'}</Text>
              </TouchableOpacity>
              {editing && (
                <TouchableOpacity style={s.deleteBtn} onPress={removeAgent}>
                  <Text style={s.deleteBtnText}>Verwijderen</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── CHAT ── */}
        {view === 'chat' && selected && (
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={20}>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
              <View style={s.agentHead}>
                <Text style={{ fontSize: 30 }}>{selected.emoji || '🤖'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={s.agentHeadName}>{selected.name}</Text>
                  {!!selected.role && <Text style={s.agentHeadRole}>{selected.role}</Text>}
                </View>
                <View style={[s.modelBadge, { backgroundColor: MODEL_BADGE_COLOR[selected.model] || '#374151' }]}>
                  <Text style={s.modelBadgeText}>{(selected.model || 'sonnet').toUpperCase()}</Text>
                </View>
              </View>

              {running && (
                <View style={s.runningRow}>
                  <ActivityIndicator color="#2563EB" size="small" />
                  <Text style={s.runningText}>{selected.name} denkt na...</Text>
                </View>
              )}
              {reply && (
                <View style={s.replyBox}>
                  <Text style={s.replyLabel}>Antwoord</Text>
                  <Text style={s.replyText}>{reply}</Text>
                </View>
              )}
            </ScrollView>
            <View style={s.inputBar}>
              <TextInput style={s.input} placeholder={`Bericht aan ${selected.name}...`} placeholderTextColor="#6b7280"
                value={input} onChangeText={setInput} multiline />
              <TouchableOpacity onPress={trigger} disabled={running || !input.trim()}
                style={[s.sendBtn, (running || !input.trim()) && { backgroundColor: '#27272a' }]}>
                <Ionicons name="send" size={18} color={(running || !input.trim()) ? '#6b7280' : '#fff'} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#18181b' },
  center:         { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#27272a' },
  headerTitle:    { color: '#f9fafb', fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  empty:          { alignItems: 'center', gap: 10, paddingTop: 70, paddingHorizontal: 40 },
  emptyText:      { color: '#9ca3af', fontSize: 14, textAlign: 'center' },
  agentRow:       { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#27272a' },
  agentMain:      { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  agentEmoji:     { fontSize: 20 },
  agentName:      { color: '#f9fafb', fontSize: 15, fontWeight: '600' },
  agentRole:      { color: '#9ca3af', fontSize: 12, marginTop: 1 },
  editBtn:        { paddingHorizontal: 16, paddingVertical: 16 },
  modelBadge:     { borderRadius: 4, paddingHorizontal: 7, paddingVertical: 3 },
  modelBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  newBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 13, marginHorizontal: 16, marginTop: 18 },
  newBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  label:          { color: '#9ca3af', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 14 },
  field:          { backgroundColor: '#27272a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#f9fafb' },
  fieldMulti:     { minHeight: 100, textAlignVertical: 'top' },
  emojiRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiBtn:       { width: 40, height: 40, borderRadius: 8, backgroundColor: '#27272a', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  emojiBtnOn:     { borderColor: '#2563EB' },
  modelRow:       { flexDirection: 'row', gap: 8 },
  modelOpt:       { flex: 1, borderWidth: 1, borderColor: '#3f3f46', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  modelOptText:   { color: '#9ca3af', fontSize: 13, fontWeight: '600' },
  saveBtn:        { backgroundColor: '#2563EB', borderRadius: 8, paddingVertical: 13, alignItems: 'center', marginTop: 22 },
  saveBtnText:    { color: '#fff', fontSize: 15, fontWeight: '700' },
  deleteBtn:      { borderWidth: 1, borderColor: '#7f1d1d', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 10 },
  deleteBtnText:  { color: '#f87171', fontSize: 14, fontWeight: '600' },
  agentHead:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  agentHeadName:  { color: '#f9fafb', fontSize: 18, fontWeight: '700' },
  agentHeadRole:  { color: '#9ca3af', fontSize: 13, marginTop: 2 },
  runningRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  runningText:    { color: '#9ca3af', fontSize: 13 },
  replyBox:       { backgroundColor: '#0f1f14', borderWidth: 1, borderColor: '#166534', borderRadius: 8, padding: 14 },
  replyLabel:     { color: '#4ade80', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 },
  replyText:      { color: '#dcfce7', fontSize: 14, lineHeight: 21 },
  inputBar:       { flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: '#27272a', backgroundColor: '#18181b' },
  input:          { flex: 1, maxHeight: 120, backgroundColor: '#27272a', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#f9fafb' },
  sendBtn:        { width: 42, height: 42, borderRadius: 21, backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center' },
});
