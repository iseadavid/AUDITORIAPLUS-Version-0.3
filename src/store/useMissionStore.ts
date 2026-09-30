/**
 * AUDITORIAPLUS+ - Fase 2
 * Gestor de Estado Global con Zustand para Auditoría Offline-First.
 * 
 * Reglas de Arquitectura:
 * - Cero datos simulados.
 * - Lectura directa de PostgreSQL Read Models:
 *   "Read_Missions", "Read_Mission_Tasks", "Read_Floor_Discrepancies", "Read_Virtual_Transfers".
 * - REGLA FORMATO CERO-IZQUIERDA (LPAD): Si el término de búsqueda coincide con /^\d{1,5}$/,
 *   se rellena con ceros a la izquierda hasta 6 dígitos (searchTerm.padStart(6, '0')).
 *   Búsqueda por SkuCode exacto y dentro del array JSONB Barcodes.
 * - Actualización optimista en caliente de métricas y persistencia offline con IndexedDB.
 * - Sincronización automática vía Edge Function `register-count`.
 */

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  Mission,
  MissionTask,
  FloorDiscrepancy,
  VirtualTransfer,
  SUPABASE_TABLES,
} from '../types/audit';
import {
  enqueueOfflineEvent,
  processOfflineQueue,
  saveMissionToCache,
  getMissionFromCache,
  getPendingOfflineEventsCount,
  setupOfflineQueueListeners,
  OfflineCountEvent,
} from '../lib/offline/indexedDB';

export interface MissionState {
  // Estado principal
  activeMission: Mission | null;
  tasks: MissionTask[];
  activeTask: MissionTask | null;
  floorDiscrepancies: FloorDiscrepancy[];
  virtualTransfers: VirtualTransfer[];
  isOnline: boolean;
  pendingOfflineCount: number;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;

  // Acciones y métodos
  loadMissionData: (missionId: string) => Promise<void>;
  setActiveTaskBySku: (searchTerm: string) => MissionTask | null;
  updateTaskCountLocally: (
    taskId: string,
    countedQty: number,
    salesQty: number
  ) => Promise<{ success: boolean; offline: boolean; error?: string }>;
  syncOfflineEvents: () => Promise<void>;
  setIsOnline: (online: boolean) => void;
  refreshPendingCount: () => Promise<void>;
  clearActiveTask: () => void;
}

export const useMissionStore = create<MissionState>((set, get) => {
  // Inicialización de listener para sincronización en background
  if (typeof window !== 'undefined') {
    setupOfflineQueueListeners((remaining) => {
      set({ pendingOfflineCount: remaining });
    });

    window.addEventListener('online', () => {
      set({ isOnline: true });
      get().syncOfflineEvents();
    });

    window.addEventListener('offline', () => {
      set({ isOnline: false });
    });

    // Cargar conteo inicial de eventos pendientes
    getPendingOfflineEventsCount()
      .then((count) => set({ pendingOfflineCount: count }))
      .catch(() => {});
  }

  return {
    activeMission: null,
    tasks: [],
    activeTask: null,
    floorDiscrepancies: [],
    virtualTransfers: [],
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    pendingOfflineCount: 0,
    isLoading: false,
    isSyncing: false,
    error: null,

    setIsOnline: (online: boolean) => set({ isOnline: online }),

    clearActiveTask: () => set({ activeTask: null }),

    refreshPendingCount: async () => {
      const count = await getPendingOfflineEventsCount();
      set({ pendingOfflineCount: count });
    },

    /**
     * loadMissionData:
     * Realiza lecturas directas a las tablas "Read_Missions", "Read_Mission_Tasks",
     * "Read_Floor_Discrepancies" y "Read_Virtual_Transfers". Guarda en IndexedDB missions_cache.
     * Si no hay conexión o falla la red, recupera los datos desde IndexedDB.
     */
    loadMissionData: async (missionId: string) => {
      set({ isLoading: true, error: null });

      try {
        // Intentar lectura directa desde Supabase PostgreSQL Read Models
        const [missionQuery, tasksQuery, discQuery, transQuery] = await Promise.all([
          supabase
            .from(SUPABASE_TABLES.MISSIONS)
            .select('*')
            .eq('MissionId', missionId)
            .single(),
          supabase
            .from(SUPABASE_TABLES.MISSION_TASKS)
            .select('*')
            .eq('MissionId', missionId)
            .order('UpdatedAt', { ascending: false }),
          supabase
            .from(SUPABASE_TABLES.FLOOR_DISCREPANCIES)
            .select('*')
            .eq('MissionId', missionId)
            .order('CreatedAt', { ascending: false }),
          supabase
            .from(SUPABASE_TABLES.VIRTUAL_TRANSFERS)
            .select('*')
            .eq('MissionId', missionId)
            .order('CreatedAt', { ascending: false }),
        ]);

        if (missionQuery.error) {
          throw new Error(missionQuery.error.message);
        }

        const mission = missionQuery.data as unknown as Mission;
        const tasks = (tasksQuery.data as unknown as MissionTask[]) || [];
        const floorDiscrepancies = (discQuery.data as unknown as FloorDiscrepancy[]) || [];
        const virtualTransfers = (transQuery.data as unknown as VirtualTransfer[]) || [];

        // Guardar en caché offline en IndexedDB
        await saveMissionToCache({
          missionId,
          mission,
          tasks,
          discrepancies: floorDiscrepancies,
          transfers: virtualTransfers,
          cachedAt: new Date().toISOString(),
        });

        const pendingCount = await getPendingOfflineEventsCount();

        set({
          activeMission: mission,
          tasks,
          floorDiscrepancies,
          virtualTransfers,
          isLoading: false,
          pendingOfflineCount: pendingCount,
          error: null,
        });
      } catch (networkError) {
        console.warn(
          `[MissionStore] Error al leer de Supabase para ${missionId}. Intentando fallback desde IndexedDB:`,
          networkError
        );

        // Fallback: Recuperar de IndexedDB si estamos offline o la consulta falló
        const cached = await getMissionFromCache(missionId);
        if (cached) {
          const pendingCount = await getPendingOfflineEventsCount();
          set({
            activeMission: cached.mission,
            tasks: cached.tasks,
            floorDiscrepancies: cached.discrepancies,
            virtualTransfers: cached.transfers,
            isLoading: false,
            pendingOfflineCount: pendingCount,
            error: 'Modo Offline: Datos cargados desde el caché local de IndexedDB.',
          });
        } else {
          set({
            isLoading: false,
            error:
              networkError instanceof Error
                ? networkError.message
                : 'Error al cargar datos de la misión y no hay caché local disponible.',
          });
        }
      }
    },

    /**
     * setActiveTaskBySku:
     * - REGLA FORMATO CERO-IZQUIERDA (LPAD): Si searchTerm coincide con /^\d{1,5}$/,
     *   rellena con ceros a la izquierda hasta 6 dígitos: searchTerm.padStart(6, '0').
     * - Indexa y busca la tarea tanto por skuCode exacto como dentro del array JSONB barcodes.
     */
    setActiveTaskBySku: (searchTerm: string): MissionTask | null => {
      const trimmed = searchTerm.trim();
      if (!trimmed) {
        set({ activeTask: null });
        return null;
      }

      // REGLA FORMATO CERO-IZQUIERDA (LPAD)
      const isShortNumeric = /^\d{1,5}$/.test(trimmed);
      const normalizedSku = isShortNumeric ? trimmed.padStart(6, '0') : trimmed;
      const lowerSearch = trimmed.toLowerCase();
      const lowerNormalized = normalizedSku.toLowerCase();

      const { tasks } = get();

      // Búsqueda prioritaria:
      // 1. SkuCode coincide exactamente con el código normalizado LPAD o el original
      // 2. Coincidencia dentro del array barcodes (códigos de barra de la presentación)
      let foundTask = tasks.find(
        (t) =>
          t.SkuCode.toLowerCase() === lowerNormalized ||
          t.SkuCode.toLowerCase() === lowerSearch
      );

      if (!foundTask) {
        foundTask = tasks.find((t) => {
          if (!t.Barcodes || !Array.isArray(t.Barcodes)) return false;
          return t.Barcodes.some(
            (b) =>
              b === trimmed ||
              b === normalizedSku ||
              b.toLowerCase() === lowerSearch ||
              b.toLowerCase() === lowerNormalized
          );
        });
      }

      set({ activeTask: foundTask || null });
      return foundTask || null;
    },

    /**
     * updateTaskCountLocally:
     * Actualiza de forma optimista las métricas en caliente (countedSkus, pendingSkus,
     * discrepantSkus, reconciledSkus) en el estado global.
     * Si hay conexión, invoca supabase.functions.invoke('register-count');
     * si falla o no hay conexión, encola en IndexedDB offline_events_queue.
     */
    updateTaskCountLocally: async (
      taskId: string,
      countedQty: number,
      salesQty: number
    ) => {
      const { activeMission, tasks, isOnline } = get();

      if (!activeMission) {
        return { success: false, offline: false, error: 'No hay ninguna misión activa seleccionada.' };
      }

      const taskIndex = tasks.findIndex((t) => t.TaskId === taskId);
      if (taskIndex === -1) {
        return { success: false, offline: false, error: `Tarea con ID ${taskId} no encontrada.` };
      }

      const existingTask = tasks[taskIndex];
      const nowIso = new Date().toISOString();

      // Cálculo de discrepancia:
      // Discrepancia = (Cantidad Contada Física + Ventas durante Auditoría) - Cantidad del Sistema
      const effectivePhysical = countedQty + salesQty;
      const discrepancy = effectivePhysical - existingTask.SystemQuantity;
      const newStatus = discrepancy === 0 ? 'COMPLETED' : 'DISCREPANT';

      // 1. Actualización optimista de la tarea
      const updatedTask: MissionTask = {
        ...existingTask,
        CountedQuantity: countedQty,
        SalesDuringAudit: salesQty,
        Discrepancy: discrepancy,
        Status: existingTask.Status === 'RECONCILED' ? 'RECONCILED' : newStatus,
        UpdatedAt: nowIso,
      };

      const updatedTasks = [...tasks];
      updatedTasks[taskIndex] = updatedTask;

      // 2. Recálculo en caliente de métricas de la Misión
      const countedSkus = updatedTasks.filter((t) => t.CountedQuantity !== null).length;
      const pendingSkus = updatedTasks.filter((t) => t.CountedQuantity === null).length;
      const discrepantSkus = updatedTasks.filter(
        (t) => t.CountedQuantity !== null && t.Discrepancy !== 0 && t.Status !== 'RECONCILED'
      ).length;
      const reconciledSkus = updatedTasks.filter((t) => t.Status === 'RECONCILED').length;

      const updatedMission: Mission = {
        ...activeMission,
        CountedSkus: countedSkus,
        PendingSkus: pendingSkus,
        DiscrepantSkus: discrepantSkus,
        ReconciledSkus: reconciledSkus,
        UpdatedAt: nowIso,
      };

      // Actualizar estado en caliente (Optimistic UI)
      set({
        tasks: updatedTasks,
        activeMission: updatedMission,
        activeTask: get().activeTask?.TaskId === taskId ? updatedTask : get().activeTask,
      });

      // Actualizar caché de IndexedDB con la foto más reciente
      saveMissionToCache({
        missionId: activeMission.MissionId,
        mission: updatedMission,
        tasks: updatedTasks,
        discrepancies: get().floorDiscrepancies,
        transfers: get().virtualTransfers,
        cachedAt: nowIso,
      }).catch((cacheErr) => {
        console.error('[MissionStore] Error al sincronizar caché local de misión:', cacheErr);
      });

      // Preparación del payload del evento
      const eventPayload: OfflineCountEvent = {
        eventId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        missionId: activeMission.MissionId,
        taskId: existingTask.TaskId,
        depositCode: existingTask.DepositCode,
        skuCode: existingTask.SkuCode,
        countedQuantity: countedQty,
        salesQuantity: salesQty,
        discrepancy: discrepancy,
        timestamp_utc: nowIso,
        user_id: 'auditor_pwa_terminal_1',
        retryCount: 0,
      };

      // 3. Envío directo o Encolamiento Offline
      const hasNetwork = typeof navigator !== 'undefined' ? navigator.onLine : isOnline;

      if (hasNetwork) {
        try {
          const { data, error } = await supabase.functions.invoke('register-count', {
            body: {
              eventId: eventPayload.eventId,
              event_id: eventPayload.eventId,
              missionId: eventPayload.missionId,
              mission_id: eventPayload.missionId,
              taskId: eventPayload.taskId,
              task_id: eventPayload.taskId,
              depositCode: eventPayload.depositCode,
              deposit_code: eventPayload.depositCode,
              skuCode: eventPayload.skuCode,
              sku_code: eventPayload.skuCode,
              countedQuantity: eventPayload.countedQuantity,
              counted_quantity: eventPayload.countedQuantity,
              salesQuantity: eventPayload.salesQuantity,
              sales_during_audit: eventPayload.salesQuantity,
              discrepancy: eventPayload.discrepancy,
              timestamp_utc: eventPayload.timestamp_utc,
              user_id: eventPayload.user_id,
            },
          });

          if (!error && (data?.success === true || data?.status === 200)) {
            return { success: true, offline: false };
          }

          // Si la Edge Function reportó error de servidor o timeout, encolar en IndexedDB
          console.warn('[MissionStore] Fallo en register-count. Encolando en IndexedDB...', error);
          await enqueueOfflineEvent(eventPayload);
          const pendingCount = await getPendingOfflineEventsCount();
          set({ pendingOfflineCount: pendingCount });
          return { success: true, offline: true };
        } catch (callError) {
          console.warn('[MissionStore] Excepción de red al invocar register-count. Encolando...', callError);
          await enqueueOfflineEvent(eventPayload);
          const pendingCount = await getPendingOfflineEventsCount();
          set({ pendingOfflineCount: pendingCount });
          return { success: true, offline: true };
        }
      } else {
        // Encolar directamente en modo Offline
        await enqueueOfflineEvent(eventPayload);
        const pendingCount = await getPendingOfflineEventsCount();
        set({ pendingOfflineCount: pendingCount });
        return { success: true, offline: true };
      }
    },

    /**
     * syncOfflineEvents:
     * Procesa la cola de IndexedDB enviando los eventos a la Edge Function `register-count`.
     */
    syncOfflineEvents: async () => {
      const { isSyncing } = get();
      if (isSyncing) return;

      set({ isSyncing: true });
      try {
        const result = await processOfflineQueue((remaining) => {
          set({ pendingOfflineCount: remaining });
        });
        set({ pendingOfflineCount: result.remaining });
      } catch (err) {
        console.error('[MissionStore] Error durante syncOfflineEvents:', err);
      } finally {
        set({ isSyncing: false });
      }
    },
  };
});
