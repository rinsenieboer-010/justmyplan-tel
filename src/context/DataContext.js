import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  loadTasks, loadEvents, loadLists,
  addTaskDB, updateTaskDB, trashTaskDB,
  addEventDB, updateEventDB, deleteEventDB,
  addListDB, updateListDB, deleteListDB,
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
  const [events, setEvents] = useState([]);
  const [lists,  setLists]  = useState(DEFAULT_LISTS);
  const [trash,  setTrash]  = useState([]);

  const reloadAll = useCallback(async () => {
    // Eigen data + shares parallel laden (getSession leest lokaal, geen extra network call)
    const { data: { session } } = await supabase.auth.getSession();
    const userEmail = session?.user?.email;

    const [t, ev, ls, sharesResult] = await Promise.all([
      loadTasks(userId),
      loadEvents(userId),
      loadLists(userId),
      userEmail
        ? supabase.from('shares').select('*').eq('invited_email', userEmail).eq('status', 'accepted')
        : Promise.resolve({ data: [] }),
    ]);

    const shares = sharesResult.data || [];

    // Data van elke share-eigenaar laden
    const sharedResults = await Promise.all(
      shares.map(async (share) => {
        const [sTasks, sLists] = await Promise.all([
          loadTasks(share.owner_id),
          loadLists(share.owner_id),
        ]);
        return { share, sTasks: sTasks || [], sLists };
      })
    );

    // Lijsten samenvoegen: eigen + gedeeld (met prefix)
    const ownLists = ls || DEFAULT_LISTS;
    const sharedLists = sharedResults.flatMap(({ share, sLists }) =>
      (sLists || DEFAULT_LISTS).map(l => ({
        ...l,
        id: prefixSharedId(share.owner_id, l.id),
        isShared: true,
        ownerId: share.owner_id,
        ownerEmail: share.owner_email,
        permission: share.permission,
      }))
    );

    // Taken samenvoegen: eigen + gedeeld (met prefix op list-veld)
    const sharedTasks = sharedResults.flatMap(({ share, sTasks }) =>
      sTasks.map(task => ({
        ...task,
        list: prefixSharedId(share.owner_id, task.list || 'mine'),
        isShared: true,
        ownerId: share.owner_id,
        permission: share.permission,
      }))
    );

    setTasks([...t, ...sharedTasks]);
    setEvents(ev);
    setLists([...ownLists, ...sharedLists]);
  }, [userId]);

  useEffect(() => { reloadAll(); }, [reloadAll]);

  // Realtime: eigen data
  useEffect(() => {
    const ch = supabase
      .channel(`user-data-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks',  filter: `user_id=eq.${userId}` }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `user_id=eq.${userId}` }, reloadAll)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists',  filter: `user_id=eq.${userId}` }, reloadAll)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [userId, reloadAll]);

  // Taken toevoegen: ownerId meegeven voor gedeelde lijsten
  const addTask = async (task, ownerId) => {
    const targetId = ownerId || userId;
    const parsed = ownerId ? parseSharedId(task.list) : null;
    const dbTask = parsed ? { ...task, list: parsed.originalId } : task;
    await addTaskDB(targetId, dbTask);
    await reloadAll();
  };

  const updateTask = async (task) => {
    await updateTaskDB(task);
    await reloadAll();
  };

  // Zacht verwijderen (naar prullenbak) — consistent met de web-app, terug te halen
  const deleteTask = async (id) => {
    await trashTaskDB(id);
    await reloadAll();
  };

  const completeTask = async (task) => {
    await trashTaskDB(task.id);
    setTrash(t => [...t, { ...task, completedAt: new Date().toISOString() }]);
    await reloadAll();
  };

  const addEvent = async (event) => {
    const saved = await addEventDB(userId, event);
    setEvents(e => [...e, saved]);
    return saved;
  };

  const updateEvent = async (event) => {
    await updateEventDB(event);
    setEvents(e => e.map(x => x.id === event.id ? event : x));
  };

  const deleteEvent = async (id) => {
    await deleteEventDB(id);
    setEvents(e => e.filter(x => x.id !== id));
  };

  const addList = async (list) => {
    const saved = await addListDB(userId, list);
    setLists(l => [...l, saved]);
    return saved;
  };

  const updateList = async (list) => {
    await updateListDB(list);
    setLists(l => l.map(x => x.id === list.id ? list : x));
  };

  const deleteList = async (id) => {
    await deleteListDB(id);
    setLists(l => l.filter(x => x.id !== id));
  };

  return (
    <DataContext.Provider value={{
      tasks, events, lists, trash, userId,
      addTask, updateTask, deleteTask, completeTask,
      addEvent, updateEvent, deleteEvent,
      addList, updateList, deleteList,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export const useData = () => useContext(DataContext);
