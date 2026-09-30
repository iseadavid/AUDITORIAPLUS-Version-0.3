/**
 * AUDITORIAPLUS+ - Fase 2
 * Definición de tipos TypeScript para el modelo de datos PostgreSQL en Supabase.
 * Alineado exactamente con el esquema de base de datos en producción y las tablas Read Model.
 */

// Códigos de depósito permitidos en el sistema
export type DepositCode = '150101' | '150103' | '150104';

// Estados de la tarea de auditoría por SKU
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'DISCREPANT' | 'RECONCILED';

// Estados de discrepancias de conteo en piso de venta
export type DiscrepancyStatus = 'PENDING_FLOOR_COUNT' | 'RESOLVED';

// Estados generales de la Misión de auditoría
export type MissionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

// Estados para transferencias virtuales sugeridas
export type VirtualTransferStatus = 'SUGGESTED' | 'EXECUTED';

/**
 * Entidad Mission: Representa la sesión o misión de auditoría de un depósito.
 * Mapeada a la tabla Read Model: "Read_Missions"
 */
export interface Mission {
  MissionId: string;
  Name: string;
  DepositCode: string;
  ExcelHashSHA256: string;
  Status: MissionStatus;
  TotalSkus: number;
  CountedSkus: number;
  PendingSkus: number;
  DiscrepantSkus: number;
  ReconciledSkus: number;
  CreatedAt: string;
  UpdatedAt: string;
}

/**
 * Entidad MissionTask: Tarea individual de conteo físico para un SKU específico.
 * Mapeada a la tabla Read Model: "Read_Mission_Tasks"
 */
export interface MissionTask {
  TaskId: string;
  MissionId: string;
  DepositCode: string;
  SkuCode: string;
  SkuDescription: string;
  Barcodes: string[];
  Cost: number;
  SystemQuantity: number;
  SalesDuringAudit: number;
  CountedQuantity: number | null;
  Discrepancy: number;
  Status: TaskStatus;
  IsFichaComplete: boolean;
  UpdatedAt: string;
}

/**
 * Entidad FloorDiscrepancy: Discrepancia detectada en almacén que requiere
 * verificación cruzada de conteo en el piso de venta correspondiente.
 * Mapeada a la tabla Read Model: "Read_Floor_Discrepancies"
 */
export interface FloorDiscrepancy {
  DiscrepancyId: string;
  MissionId: string;
  OriginDeposit: string;
  FloorDeposit: string;
  SkuCode: string;
  SkuDescription: string;
  WarehouseDiscrepancy: number;
  FloorSystemQuantity: number;
  FloorCountedQuantity: number | null;
  FloorDiscrepancy: number | null;
  Status: DiscrepancyStatus;
  CreatedAt: string;
  UpdatedAt: string;
}

/**
 * Entidad VirtualTransfer: Transferencia virtual generada o sugerida
 * para reconciliar faltantes y sobrantes entre depósitos/piso.
 * Mapeada a la tabla Read Model: "Read_Virtual_Transfers"
 */
export interface VirtualTransfer {
  TransferId: string;
  MissionId: string;
  SkuCode: string;
  SkuDescription: string;
  FromDeposit: string;
  ToDeposit: string;
  TransferQuantity: number;
  TransitDeposit: string;
  Status: VirtualTransferStatus;
  CreatedAt: string;
}

/**
 * Constantes con los nombres exactos con comillas para las consultas en Supabase Read Model.
 * Regla de Oro: En PostgreSQL las tablas con mayúsculas/guiones bajos están cotizadas.
 */
export const SUPABASE_TABLES = {
  MISSIONS: 'Read_Missions',
  MISSION_TASKS: 'Read_Mission_Tasks',
  FLOOR_DISCREPANCIES: 'Read_Floor_Discrepancies',
  VIRTUAL_TRANSFERS: 'Read_Virtual_Transfers',
} as const;

export type SupabaseTableName = (typeof SUPABASE_TABLES)[keyof typeof SUPABASE_TABLES];

/**
 * Mapeo de tipos para el cliente de Supabase (Database Schema Definition)
 */
export interface AuditDatabase {
  public: {
    Tables: {
      'Read_Missions': {
        Row: Mission;
        Insert: never; // Inserciones restringidas a Edge Functions
        Update: never; // Actualizaciones restringidas a Edge Functions
        Delete: never;
      };
      'Read_Mission_Tasks': {
        Row: MissionTask;
        Insert: never;
        Update: never;
        Delete: never;
      };
      'Read_Floor_Discrepancies': {
        Row: FloorDiscrepancy;
        Insert: never;
        Update: never;
        Delete: never;
      };
      'Read_Virtual_Transfers': {
        Row: VirtualTransfer;
        Insert: never;
        Update: never;
        Delete: never;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      deposit_code: DepositCode;
      task_status: TaskStatus;
      discrepancy_status: DiscrepancyStatus;
    };
  };
}

/**
 * Tipos para invocaciones a Supabase Edge Functions (Mutaciones y Escrituras)
 */
export interface EdgeFunctionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp?: string;
}
