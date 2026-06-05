import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loadTasks, loadEvents, loadLists,
  addTaskDB, updateTaskDB, trashTaskDB,
  addEventDB, updateEventDB, deleteEventDB,
  addListDB, updateListDB, deleteListDB,
  loadShareLists, setShareLists,
  loadPersonColors, setPersonColorDB, removePersonColorDB,
} from '../db';
import { supabase } from '../supabase';

const DataContext = createContext(null);

export const DEFAULT_LISTS = [
  { id: 'mine',       label: 'Mijn taken',  color: '#2563EB' },
  { id: 'school',     label: 'School',      color: '#E6B400' },
  { id: 'huishouden', label: 'Huishouden',  color: '#DC2626' },
  { id: 'werk',       label: 'Werk',        color: '#DC2626' },
];

// Namespace gedeelde lijst-IDs zodat ze niet botsen met eigen IDs
export function prefixSharedId(ownerId, id) {
  return `s:${ownerId}:${id}`;
}

export function parseSharedId(id) {
  if (typeof id !== 'string' || !id.startsWith('s:')) return null;
  const rest = id.slice(2);
  const colon = rest.indexOf(':');
  if (colon === -1) return null;
  return { ownerId: rest.slice(0, colon), originalId: rest.slice(colon + 1) };
}

export function DataProvider({ userId, children }) {
  const [tasks,  setTasks]  = useState([]);
  const [events, setEvents] = useState([]);          // eigen afspraken
  const [sharedEvents, setSharedEvents] = useState([]); // afspraken van anderen
  const [lists,  setLists]  = useState(DEFAULT_LISTS);
  const [trash,  setTrash]  = useState([]);

  const [personColors,  setPersonColors]  = useState({}); // email -> kleur-key
  const [outgoingShares, setOutgoingShares] = useState([]); // shares waar ik eigenaar ben
  const [incomingShares, setIncomingShares] = useState([]); // openstaande uitnodigingen aan mij
  const [sharedWithMe,   setSharedWithMe]   = useState([]); // geaccepteerde shares waarin ik uitgenodigd ben
  const [shareListsMap, setShareListsMap]   = useState({}); // shareId -> [listId,...] (mijn uitgaande)

  const reloadAll = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email;

    const [t, ev, ls, pcs, incomingRes, outgoingRes] = await Promise.all([
      loadTasks(userId),
      loadEvents(userId),
      loadLists(userId),
      loadPersonColors(userId),
      userEmail
        ? supabase.from('shares').select('*').eq('invited_email', userEmail).eq('status', 'accepted')
        : Promise.resolve({ data: [] }),
      supabase.from('shares').select('*').eq('owner_id', userId),
    ]);

    // Personenkleuren als map
    const colorMap = {};
    pcs.forEach(({ email, color }) => { colorMap[email] = color; });

    // ── Gedeeld MET mij: lijsten (uit share_lists) + taken + afspraken per eigenaar
    const accepted = incomingRes.data || [];
    const sharedResults = await Promise.all(
      accepted.map(async (share) => {
        const [shareLists, sTasks, sEvents] = await Promise.all([
          loadShareLists(share.id),     // welke lijsten deelt deze eigenaar met mij
          loadTasks(share.owner_id),    // RLS beperkt tot gedeelde lijsten
          loadEvents(share.owner_id),   // RLS beperkt tot afspraken die met mij gedeeld zijn
        ]);
        return { share, shareLists, sTasks, sEvents };
      })
    );

    const sharedLists = sharedResults.flatMap(({ share, shareLists }) =>
      shareLists.map(l => ({
        id: prefixSharedId(share.owner_id, l.listId),
        label: l.label || 'Gedeeld',
        color: l.color || '#9ca3af',
        isShared: true,
        ownerId: share.owner_id,
        ownerEmail: share.owner_email,
        permission: share.permission,
      }))
    );

    const sharedTasks = sharedResults.flatMap(({ share, sTasks }) =>
      sTasks.map(task => ({
        ...task,
        list: prefixSharedId(share.owner_id, task.list || 'mine'),
        isShared: true,
        ownerId: share.owner_id,
        ownerEmail: share.owner_email,
        permission: share.permission,
      }))
    );

    const allSharedEvents = sharedResults.flatMap(({ share, sEvents }) =>
      sEvents.map(e => ({
        ...e,
        isShared: true,
        ownerId: share.owner_id,
        ownerEmail: share.owner_email,
      }))
    );

    // ── Gedeeld DOOR mij: huidige lijst-selectie per uitgaande share (voor instellingen)
    const outgoing = outgoingRes.data || [];
    const slMap = {};
    await Promise.all(outgoing.map(async (share) => {
      const sl = await loadShareLists(share.id);
      slMap[share.id] = sl.map(x => x.listId);
    }));

    const ownLists = ls || DEFAULT_LISTS;

    setTasks([...t, ...sharedTasks]);
    setEvents(ev);
    setSharedEvents(allSharedEvents);
    setLists([...ownLists, ...sharedLists]);
    setPersonColors(colorMap);
    setOutgoingShares(outgoing);
    setSharedWithMe(accepted);
    setShareListsMap(slMap);

    // Openstaande uitnodigingen aan mij
    if (userEmail) {
      const { data: pend } = await supabase.from('shares')
        .select('*').eq('invited_email', userEmail).eq('status', 'pending');
      setIncomingShares(pend || []);
    }
  }, [userId]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  // Realtime: eigen data + gedeelde wijzigingen
  useEffect(() => {
    const ch = supabase
      .channel(`user-data-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks'  }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists'  }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'share_lists' }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shares' }, reloadAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [userId, reloadAll]);

  // ── Taken ──
  const addTask = async (task, ownerId) => {
    const targetId = ownerId || userId;
    const parsed = ownerId ? parseSharedId(task.list) : null;
    const dbTask = parsed ? { ...task, list: parsed.originalId } : task;
    await addTaskDB(targetId, dbTask);
    await reloadAll();
  };
  const updateTask = async (task) => { await updateTaskDB(task); await reloadAll(); };
  const deleteTask = async (id) => { await trashTaskDB(id); await reloadAll(); };
  const completeTask = async (task) => {
    await trashTaskDB(task.id);
    setTrash(t => [...t, { ...task, completedAt: new Date().toISOString() }]);
    await reloadAll();
  };

  // ── Afspraken ──
  const addEvent = async (event) => { const saved = await addEventDB(userId, event); await reloadAll(); return saved; };
  const updateEvent = async (event) => { await updateEventDB(event); await reloadAll(); };
  const deleteEvent = async (id) => { await deleteEventDB(id); await reloadAll(); };

  // ── Lijsten ──
  const addList = async (list) => { const saved = await addListDB(userId, list); setLists(l => [...l, saved]); return saved; };
  const updateList = async (list) => { await updateListDB(list); setLists(l => l.map(x => x.id === list.id ? list : x)); };
  const deleteList = async (id) => { await deleteListDB(id); setLists(l => l.filter(x => x.id !== id)); };

  // ── Delen beheren ──
  const invitePerson = async (email, permission) => {
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.from('shares').insert({
      owner_id: userId, owner_email: session?.user?.email,
      invited_email: email.trim().toLowerCase(), permission,
    });
    await reloadAll();
  };
  const removeShare = async (id) => { await supabase.from('shares').delete().eq('id', id); await reloadAll(); };
  const updateSharePermission = async (id, permission) => {
    await supabase.from('shares').update({ permission }).eq('id', id); await reloadAll();
  };
  const acceptInvitation = async (id) => { await supabase.from('shares').update({ status: 'accepted' }).eq('id', id); await reloadAll(); };
  const declineInvitation = async (id) => { await supabase.from('shares').update({ status: 'declined' }).eq('id', id); await reloadAll(); };

  // Welke van mijn lijsten deel ik met deze share (lijst van objecten)
  const saveShareLists = async (shareId, listObjs) => {
    await setShareLists(shareId, listObjs);
    await reloadAll();
  };

  // Kleur toewijzen aan een persoon (of wissen met null)
  const setPersonColor = async (email, color) => {
    if (color) await setPersonColorDB(userId, email, color);
    else await removePersonColorDB(userId, email);
    await reloadAll();
  };

  return (
    <DataContext.Provider value={{
      tasks, events, sharedEvents, lists, trash, userId,
      personColors, outgoingShares, incomingShares, sharedWithMe, shareListsMap,
      addTask, updateTask, deleteTask, completeTask,
      addEvent, updateEvent, deleteEvent,
      addList, updateList, deleteList,
      invitePerson, removeShare, updateSharePermission, acceptInvitation, declineInvitation,
      saveShareLists, setPersonColor,
      refresh: reloadAll,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
