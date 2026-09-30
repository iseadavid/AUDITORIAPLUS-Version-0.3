/**
 * AUDITORIAPLUS+ - Fase 2
 * Cliente de Supabase y capa de acceso a datos para PostgreSQL y Edge Functions.
 * 
 * Reglas de arquitectura:
 * 1. LECTURAS: Directas a Supabase usando las tablas de Read Model con nombres exactos:
 *    - "Read_Missions"
 *    - "Read_Mission_Tasks"
 *    - "Read_Floor_Discrepancies"
 *    - "Read_Virtual_Transfers"
 * 2. ESCRITURAS / MUTACIONES: Exclusivamente a través de Supabase Edge Functions.
 * 3. Cero datos simulados (mock data).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AuditDatabase,
  SUPABASE_TABLES,
  Mission,
  MissionTask,
  FloorDiscrepancy,
  VirtualTransfer,
  EdgeFunctionResponse,
} from '../types/audit';

// Obtención de variables de entorno de Vite
const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || '';
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

// Soporte para configuración dinámica en tiempo de ejecución (si aún no se ha reiniciado Vite con el .env)
const runtimeUrl = typeof window !== 'undefined' ? window.localStorage.getItem('AUDITORIAPLUS_SUPABASE_URL') || '' : '';
const runtimeKey = typeof window !== 'undefined' ? window.localStorage.getItem('AUDITORIAPLUS_SUPABASE_KEY') || '' : '';

export const SUPABASE_URL = envSupabaseUrl || runtimeUrl;
export const SUPABASE_ANON_KEY = envSupabaseAnonKey || runtimeKey;

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_URL.startsWith('https://') &&
  !SUPABASE_URL.includes('your-project-ref')
);

/**
 * Cliente Supabase principal fuertemente tipado.
 * Si las credenciales no están presentes en tiempo de carga, se crea con valores mínimos seguros
 * para evitar excepciones críticas en el arranque de React.
 */
export const supabase: SupabaseClient<AuditDatabase> = createClient<AuditDatabase>(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_ANON_KEY || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      headers: {
        'x-client-info': 'auditoriaplus-fase2-frontend',
      },
    },
  }
);

/**
 * Permite guardar credenciales de Supabase en localStorage para ambientes de desarrollo/pruebas.
 */
export function saveRuntimeCredentials(url: string, anonKey: string): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem('AUDITORIAPLUS_SUPABASE_URL', url.trim());
    window.localStorage.setItem('AUDITORIAPLUS_SUPABASE_KEY', anonKey.trim());
    window.location.reload();
  }
}

/**
 * Limpia las credenciales guardadas en localStorage.
 */
export function clearRuntimeCredentials(): void {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('AUDITORIAPLUS_SUPABASE_URL');
    window.localStorage.removeItem('AUDITORIAPLUS_SUPABASE_KEY');
    window.location.reload();
  }
}

// ============================================================================
// CAPA DE LECTURA (READ MODEL DIRECTO A SUPABASE POSTGRESQL)
// ============================================================================

/**
 * Consulta todas las misiones de auditoría desde la tabla "Read_Missions"
 */
export async function fetchMissions(): Promise<{ data: Mission[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.MISSIONS)
      .select('*')
      .order('CreatedAt', { ascending: false });

    if (error) {
      console.error('[Supabase Read Error] fetchMissions:', error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as unknown as Mission[]) || [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Consulta una misión específica por su MissionId desde "Read_Missions"
 */
export async function fetchMissionById(missionId: string): Promise<{ data: Mission | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.MISSIONS)
      .select('*')
      .eq('MissionId', missionId)
      .single();

    if (error) {
      console.error(`[Supabase Read Error] fetchMissionById (${missionId}):`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as unknown as Mission) || null, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Consulta las tareas de conteo de una misión desde "Read_Mission_Tasks"
 */
export async function fetchMissionTasks(missionId: string): Promise<{ data: MissionTask[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.MISSION_TASKS)
      .select('*')
      .eq('MissionId', missionId)
      .order('UpdatedAt', { ascending: false });

    if (error) {
      console.error(`[Supabase Read Error] fetchMissionTasks (${missionId}):`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as unknown as MissionTask[]) || [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Consulta las discrepancias de piso de venta para una misión desde "Read_Floor_Discrepancies"
 */
export async function fetchFloorDiscrepancies(missionId: string): Promise<{ data: FloorDiscrepancy[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.FLOOR_DISCREPANCIES)
      .select('*')
      .eq('MissionId', missionId)
      .order('CreatedAt', { ascending: false });

    if (error) {
      console.error(`[Supabase Read Error] fetchFloorDiscrepancies (${missionId}):`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as unknown as FloorDiscrepancy[]) || [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Consulta las transferencias virtuales generadas para una misión desde "Read_Virtual_Transfers"
 */
export async function fetchVirtualTransfers(missionId: string): Promise<{ data: VirtualTransfer[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLES.VIRTUAL_TRANSFERS)
      .select('*')
      .eq('MissionId', missionId)
      .order('CreatedAt', { ascending: false });

    if (error) {
      console.error(`[Supabase Read Error] fetchVirtualTransfers (${missionId}):`, error);
      return { data: null, error: new Error(error.message) };
    }

    return { data: (data as unknown as VirtualTransfer[]) || [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

// ============================================================================
// CAPA DE ESCRITURA Y MUTACIONES (EXCLUSIVAMENTE MEDIANTE EDGE FUNCTIONS)
// ============================================================================

/**
 * Invoca una Supabase Edge Function para operaciones de mutación / escritura.
 * Todas las escrituras de negocio deben pasar por esta función para garantizar
 * auditoría, validación e integridad transaccional en el backend de Supabase.
 *
 * @param functionName Nombre de la Edge Function en Supabase (ej: 'submit-count', 'execute-virtual-transfer')
 * @param payload Objeto con los parámetros de la mutación
 */
export async function callEdgeFunction<
  TResponse = unknown,
  TPayload extends Record<string, unknown> = Record<string, unknown>
>(
  functionName: string,
  payload?: TPayload
): Promise<EdgeFunctionResponse<TResponse>> {
  try {
    const { data, error } = await supabase.functions.invoke<EdgeFunctionResponse<TResponse>>(
      functionName,
      {
        body: payload,
      }
    );

    if (error) {
      console.error(`[Supabase Edge Function Error] ${functionName}:`, error);
      return {
        success: false,
        error: error.message || `Error al ejecutar Edge Function ${functionName}`,
      };
    }

    if (!data) {
      return {
        success: true,
      };
    }

    return data;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Supabase Edge Function Exception] ${functionName}:`, message);
    return {
      success: false,
      error: message,
    };
  }
}
