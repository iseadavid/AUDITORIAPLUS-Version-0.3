/**
 * AUDITORIAPLUS+ - Fase 2
 * Motor Offline `AuditDB` Versión 1 basado en IndexedDB.
 * 
 * Almacenes de Objetos (ObjectStores):
 * 1. `offline_events_queue`: KeyPath `eventId`, índice secundario `timestamp_utc`.
 * 2. `missions_cache`: KeyPath `missionId`.
 * 
 * Reglas de Sincronización:
 * - Escucha `window.addEventListener('online')` para sincronización automática.
 * - Procesa eventos de conteo hacia la Supabase Edge Function `register-count`.
 * - Elimina eventos al recibir HTTP 200 (éxito) o HTTP 409 (conflicto idempotente ya procesado).
 */

import { supabase } from '../supabase';
import { Mission, MissionTask, FloorDiscrepancy, VirtualTransfer } from '../../types/audit';

export const DB_NAME = 'AuditDB';
export const DB_VERSION = 1;

export const STORES = {
  OFFLINE_EVENTS_QUEUE: 'offline_events_queue',
  MISSIONS_CACHE: 'missions_cache',
} as const;

/**
 * Estructura del evento de conteo encolado
 */
export interface OfflineCountEvent {
  eventId: string;
  missionId: string;
  taskId: string;
  depositCode: string;
  skuCode: string;
  countedQuantity: number;
  salesQuantity: number;
  discrepancy: number;
  timestamp_utc: string; // ISO 8601 UTC
  user_id?: string;
  retryCount?: number;
}

/**
 * Estructura para el caché de misión completa
 */
export interface CachedMissionData {
  missionId: string;
  mission: Mission;
  tasks: MissionTask[];
  discrepancies: FloorDiscrepancy[];
  transfers: VirtualTransfer[];
  cachedAt: string;
}

let dbInstance: IDBDatabase | null = null;
let isProcessingQueue = false;

/**
 * Abre o recupera la instancia de la base de datos IndexedDB `AuditDB`
 */
export function openAuditDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    if (dbInstance) {
      return resolve(dbInstance);
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 1. Almacén de cola de eventos offline
      if (!db.objectStoreNames.contains(STORES.OFFLINE_EVENTS_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.OFFLINE_EVENTS_QUEUE, {
          keyPath: 'eventId',
        });
        queueStore.createIndex('timestamp_utc', 'timestamp_utc', { unique: false });
      }

      // 2. Almacén de caché de misiones completas
      if (!db.objectStoreNames.contains(STORES.MISSIONS_CACHE)) {
        db.createObjectStore(STORES.MISSIONS_CACHE, {
          keyPath: 'missionId',
        });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      dbInstance.onversionchange = () => {
        dbInstance?.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Error al abrir AuditDB:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Encola un evento de conteo en `offline_events_queue`
 */
export async function enqueueOfflineEvent(eventPayload: OfflineCountEvent): Promise<void> {
  const db = await openAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OFFLINE_EVENTS_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_EVENTS_QUEUE);

    const record: OfflineCountEvent = {
      ...eventPayload,
      retryCount: eventPayload.retryCount ?? 0,
      timestamp_utc: eventPayload.timestamp_utc || new Date().toISOString(),
    };

    const req = store.put(record);

    req.onsuccess = () => {
      resolve();
    };

    req.onerror = () => {
      console.error('[IndexedDB] Error al encolar evento offline:', req.error);
      reject(req.error);
    };
  });
}

/**
 * Obtiene todos los eventos pendientes en la cola ordenados cronológicamente por `timestamp_utc`
 */
export async function getPendingOfflineEvents(): Promise<OfflineCountEvent[]> {
  const db = await openAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OFFLINE_EVENTS_QUEUE], 'readonly');
    const store = tx.objectStore(STORES.OFFLINE_EVENTS_QUEUE);
    const index = store.index('timestamp_utc');
    const request = index.getAll();

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = () => {
      console.error('[IndexedDB] Error al leer eventos pendientes:', request.error);
      reject(request.error);
    };
  });
}

/**
 * Obtiene el conteo total de eventos pendientes en la cola
 */
export async function getPendingOfflineEventsCount(): Promise<number> {
  try {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.OFFLINE_EVENTS_QUEUE], 'readonly');
      const store = tx.objectStore(STORES.OFFLINE_EVENTS_QUEUE);
      const req = store.count();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return 0;
  }
}

/**
 * Elimina un evento de la cola por su `eventId`
 */
export async function removeOfflineEvent(eventId: string): Promise<void> {
  const db = await openAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.OFFLINE_EVENTS_QUEUE], 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_EVENTS_QUEUE);
    const req = store.delete(eventId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Guarda o actualiza una misión completa en el caché offline (`missions_cache`)
 */
export async function saveMissionToCache(data: CachedMissionData): Promise<void> {
  const db = await openAuditDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORES.MISSIONS_CACHE], 'readwrite');
    const store = tx.objectStore(STORES.MISSIONS_CACHE);
    const req = store.put(data);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Recupera una misión completa del caché offline (`missions_cache`)
 */
export async function getMissionFromCache(missionId: string): Promise<CachedMissionData | null> {
  try {
    const db = await openAuditDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORES.MISSIONS_CACHE], 'readonly');
      const store = tx.objectStore(STORES.MISSIONS_CACHE);
      const req = store.get(missionId);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Error al recuperar misión del caché:', error);
    return null;
  }
}

/**
 * Procesador de la cola offline `processOfflineQueue`:
 * - Lee los eventos ordenados por `timestamp_utc`.
 * - Invoca la Supabase Edge Function `register-count`.
 * - Si recibe 200 (éxito) o 409 (conflicto idempotente ya registrado), elimina el evento.
 * - Si hay error transitorio de red, detiene el procesamiento para preservar el orden FIFO.
 */
export async function processOfflineQueue(onQueueUpdate?: (remaining: number) => void): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  if (isProcessingQueue) {
    const count = await getPendingOfflineEventsCount();
    return { processed: 0, failed: 0, remaining: count };
  }

  // Verificar si hay conexión de red real antes de intentar el envío
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const count = await getPendingOfflineEventsCount();
    return { processed: 0, failed: 0, remaining: count };
  }

  isProcessingQueue = true;
  let processed = 0;
  let failed = 0;

  try {
    const events = await getPendingOfflineEvents();

    for (const event of events) {
      try {
        const { data, error } = await supabase.functions.invoke('register-count', {
          body: {
            eventId: event.eventId,
            event_id: event.eventId,
            missionId: event.missionId,
            mission_id: event.missionId,
            taskId: event.taskId,
            task_id: event.taskId,
            depositCode: event.depositCode,
            deposit_code: event.depositCode,
            skuCode: event.skuCode,
            sku_code: event.skuCode,
            countedQuantity: event.countedQuantity,
            counted_quantity: event.countedQuantity,
            salesQuantity: event.salesQuantity,
            sales_during_audit: event.salesQuantity,
            discrepancy: event.discrepancy,
            timestamp_utc: event.timestamp_utc,
            user_id: event.user_id || 'auditor_pwa_terminal_1',
          },
        });

        // Verificamos si la respuesta fue exitosa o si se produjo un 409 (Conflicto / Idempotente)
        let isSuccess = false;
        let isConflictIdempotent = false;

        if (!error && (data?.success === true || data?.status === 200)) {
          isSuccess = true;
        } else if (error) {
          const errString = String(error.message || error);
          const errorContext = (error as { context?: { status?: number } }).context;
          const status = errorContext?.status;

          // HTTP 409 Idempotent Conflict (ya fue registrado o procesado previamente)
          if (status === 409 || errString.includes('409') || errString.toLowerCase().includes('conflict')) {
            isConflictIdempotent = true;
          } else {
            console.warn(`[Offline Queue] Error al procesar evento ${event.eventId}:`, error);
          }
        }

        if (isSuccess || isConflictIdempotent) {
          await removeOfflineEvent(event.eventId);
          processed++;
          const remaining = await getPendingOfflineEventsCount();
          onQueueUpdate?.(remaining);
        } else {
          failed++;
          // Si el error fue de conexión de red o caída de servidor, abortamos el lote para reintentar luego
          break;
        }
      } catch (invokeErr) {
        console.error(`[Offline Queue] Excepción al invocar register-count para ${event.eventId}:`, invokeErr);
        failed++;
        break;
      }
    }
  } finally {
    isProcessingQueue = false;
  }

  const remaining = await getPendingOfflineEventsCount();
  onQueueUpdate?.(remaining);
  return { processed, failed, remaining };
}

/**
 * Inicializador de listeners globales para conectividad online/offline
 */
let isListenerInitialized = false;

export function setupOfflineQueueListeners(onQueueUpdate?: (remaining: number) => void): () => void {
  if (typeof window === 'undefined' || isListenerInitialized) {
    return () => {};
  }

  const handleOnline = () => {
    console.info('[Offline Engine] Conexión online restaurada. Despachando cola de eventos...');
    processOfflineQueue(onQueueUpdate).catch((err) => {
      console.error('[Offline Engine] Error al procesar cola al volver online:', err);
    });
  };

  window.addEventListener('online', handleOnline);
  isListenerInitialized = true;

  // Intento de procesamiento inicial si ya estamos online
  if (navigator.onLine) {
    processOfflineQueue(onQueueUpdate).catch(() => {});
  }

  return () => {
    window.removeEventListener('online', handleOnline);
    isListenerInitialized = false;
  };
}
