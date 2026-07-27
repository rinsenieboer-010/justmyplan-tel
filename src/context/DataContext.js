import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadTasks, loadEvents, loadLists,
  addTaskDB, updateTaskDB, trashTaskDB, deleteTaskDB,
  loadDeletedTasks, restoreTaskDB,
  addEventDB, updateEventDB, deleteEventDB,
  upsertListDB, deleteListDB,
  loadShareLists, setShareLists,
  loadPersonColors, setPersonColorDB, removePersonColorDB,
} from '../db';
import { supabase } from '../supabase';
import { dateKey } from '../utils';
import { ensureNotificationPermissions, syncNotifications } from '../notifications';

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

  // Swipe-pager aan/uit — TasksScreen zet dit op false terwijl je door de
  // lijst-tabs veegt, zodat je niet per ongeluk naar Agenda/Assistent springt.
  const [pagerEnabled, setPagerEnabled] = useState(true);

  // Welk scherm nu actief is (0=Taken, 1=Agenda, 2=Assistent) — o.a. zodat de
  // agenda naar de huidige week kan springen zodra je hem opent.
  const [activeScreen, setActiveScreen] = useState(0);

  // Cache: laatst geladen data lokaal bewaren zodat de app bij het openen
  // meteen de echte taken/lijsten toont in plaats van 2-3s lege blueprint.
  const cacheKey     = `jmp_cache_${userId}`;
  const freshLoaded  = useRef(false);

  // Zichtbaarheid van gedeelde items die de ontvanger zelf regelt (lokaal).
  // Bevat sleutels: een gedeelde lijst-id (verbergt die takenlijst) of
  // `cal:<ownerId>` (verbergt de gedeelde agenda van die persoon).
  const hiddenKey = `jmp_hidden_${userId}`;
  const [hiddenShared, setHiddenShared] = useState([]);
  useEffect(() => {
    AsyncStorage.getItem(hiddenKey).then(raw => {
      if (raw) { try { setHiddenShared(JSON.parse(raw)); } catch {} }
    }).catch(() => {});
  }, [hiddenKey]);
  const toggleSharedVisible = (key) => {
    setHiddenShared(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      AsyncStorage.setItem(hiddenKey, JSON.stringify(next)).catch(() => {});
      return next;
    });
  };
  const isSharedVisible = (key) => !hiddenShared.includes(key);

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

    // Verse data → cache, zodat de volgende keer opstarten direct gevuld is
    freshLoaded.current = true;
    AsyncStorage.setItem(cacheKey, JSON.stringify({
      tasks: [...t, ...sharedTasks],
      events: ev,
      sharedEvents: allSharedEvents,
      lists: [...ownLists, ...sharedLists],
    })).catch(() => {});

    // Openstaande uitnodigingen aan mij
    if (userEmail) {
      const { data: pend } = await supabase.from('shares')
        .select('*').eq('invited_email', userEmail).eq('status', 'pending');
      setIncomingShares(pend || []);
    }
  }, [userId]);

  // Direct bij openen de gecachte data tonen (tenzij het netwerk al binnen is),
  // zodat de gebruiker niet naar een lege blueprint kijkt tijdens het laden.
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(cacheKey).then(raw => {
      if (!active || !raw || freshLoaded.current) return;
      try {
        const c = JSON.parse(raw);
        if (c.tasks)        setTasks(c.tasks);
        if (c.events)       setEvents(c.events);
        if (c.sharedEvents) setSharedEvents(c.sharedEvents);
        if (c.lists)        setLists(c.lists);
      } catch {}
    }).catch(() => {});
    return () => { active = false; };
  }, [cacheKey]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  // Meldingen: toestemming vragen bij start, en bij elke datawijziging het
  // schema opnieuw plannen (kort gedebounced zodat een reload niet dubbel plant)
  useEffect(() => { ensureNotificationPermissions(); }, []);
  useEffect(() => {
    const t = setTimeout(() => syncNotifications(tasks, events), 1500);
    return () => clearTimeout(t);
  }, [tasks, events]);

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
    if (task.recurrence) {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const next = task.deadline ? new Date(task.deadline + 'T00:00:00') : new Date(today);
      const step = () => {
        if (task.recurrence === 'daily') next.setDate(next.getDate() + 1);
        else if (task.recurrence === 'weekly') next.setDate(next.getDate() + 7);
        else if (task.recurrence === 'biweekly') next.setDate(next.getDate() + 14);
        else if (task.recurrence === 'monthly') next.setMonth(next.getMonth() + 1);
        else if (typeof task.recurrence === 'string' && task.recurrence.startsWith('custom:')) {
          const [, intervalRaw, unit] = task.recurrence.split(':');
          const interval = Math.max(1, Number(intervalRaw) || 1);
          if (unit === 'days') next.setDate(next.getDate() + interval);
          else if (unit === 'weeks') next.setDate(next.getDate() + (interval * 7));
          else if (unit === 'months') next.setMonth(next.getMonth() + interval);
          else return false;
        }
        else return false;
        return true;
      };
      if (!step()) return;
      while (next <= today) step();
      await updateTaskDB({
        ...task,
        status: '',
        deadline: dateKey(next),
        lastCompletedAt: new Date().toISOString(),
      });
      await reloadAll();
      return;
    }
    await trashTaskDB(task.id);
    setTrash(t => [...t, { ...task, completedAt: new Date().toISOString() }]);
    await reloadAll();
  };
  // Prullenbak: verwijderde/voltooide taken ophalen, terughalen of definitief wissen
  const loadDeleted = async () => loadDeletedTasks(userId);
  const restoreTask = async (id) => { await restoreTaskDB(id); await reloadAll(); };
  const purgeTask   = async (id) => { await deleteTaskDB(id); };

  // ── Afspraken ──
  const addEvent = async (event) => { const saved = await addEventDB(userId, event); await reloadAll(); return saved; };
  const updateEvent = async (event) => { await updateEventDB(event); await reloadAll(); };
  const deleteEvent = async (id) => { await deleteEventDB(id); await reloadAll(); };

  // ── Lijsten ──
  // Zorg dat álle eigen lijsten in de DB staan (anders resetten de andere
  // standaardlijsten bij een reload), met de wijziging meteen toegepast.
  const ownListObjs = () => lists.filter(l => !l.isShared).map(l => ({ id: l.id, label: l.label, color: l.color }));
  const syncOwnLists = async (ownNext) => {
    await Promise.all(ownNext.map(l => upsertListDB(userId, l)));
    await reloadAll();
  };
  const addList = async (list) => {
    await syncOwnLists([...ownListObjs(), { id: list.id, label: list.label, color: list.color }]);
    return list;
  };
  const updateList = async (list) => {
    await syncOwnLists(ownListObjs().map(l => l.id === list.id ? { ...l, label: list.label, color: list.color ?? l.color } : l));
  };
  const deleteList = async (id) => { await deleteListDB(userId, id); await reloadAll(); };

  // ── Delen beheren ──
  // Uitnodigen: meteen 'accepted' (geen aparte accepteerstap) en de gekozen
  // lijsten direct meesturen zodat de ander ze meteen ziet.
  const invitePerson = async (email, permission, listObjs = []) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data: inserted } = await supabase.from('shares').insert({
      owner_id: userId, owner_email: session?.user?.email,
      invited_email: email.trim().toLowerCase(), permission, status: 'accepted',
    }).select().single();
    if (inserted && listObjs.length) await setShareLists(inserted.id, listObjs);
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
      pagerEnabled, setPagerEnabled,
      activeScreen, setActiveScreen,
      hiddenShared, toggleSharedVisible, isSharedVisible,
      personColors, outgoingShares, incomingShares, sharedWithMe, shareListsMap,
      addTask, updateTask, deleteTask, completeTask,
      loadDeleted, restoreTask, purgeTask,
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
