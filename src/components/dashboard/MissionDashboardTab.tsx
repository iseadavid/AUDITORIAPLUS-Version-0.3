import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Database,
  Wifi,
  WifiOff,
  CloudUpload,
  Boxes,
  Check,
  AlertCircle,
  FileText,
  Clock,
  Building2,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Layers,
  X,
} from 'lucide-react';
import { supabase, fetchMissions } from '../../lib/supabase';
import { Mission, DepositCode, SUPABASE_TABLES } from '../../types/audit';
import { useMissionStore } from '../../store/useMissionStore';

const DEPOSIT_NAMES: Record<DepositCode, string> = {
  '150101': '150101 - Almacén Central',
  '150103': '150103 - Farmacia / Retail',
  '150104': '150104 - Piso de Ventas',
};

export const MissionDashboardTab: React.FC = () => {
  // Conexión con Zustand Store
  const {
    activeMission,
    tasks,
    isOnline,
    pendingOfflineCount,
    isSyncing,
    isLoading: isMissionLoading,
    loadMissionData,
    syncOfflineEvents,
    setIsOnline,
  } = useMissionStore();

  // Estados locales para la lista de misiones
  const [missionsList, setMissionsList] = useState<Mission[]>([]);
  const [loadingMissions, setLoadingMissions] = useState(false);
  const [missionsError, setMissionsError] = useState<string | null>(null);

  // Estados para Ingesta de Excel
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [targetDeposit, setTargetDeposit] = useState<DepositCode>('150101');
  const [missionNameInput, setMissionNameInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    details?: string;
  }>({ type: 'idle', message: '' });

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carga reactiva de misiones desde Supabase Read Model: "Read_Missions"
  const loadMissions = useCallback(async () => {
    setLoadingMissions(true);
    setMissionsError(null);

    const { data, error } = await fetchMissions();

    if (error) {
      setMissionsError(`Error al consultar "${SUPABASE_TABLES.MISSIONS}": ${error.message}`);
    } else {
      setMissionsList(data || []);
      // Si no hay misión activa y hay misiones en la BD, cargar la primera automáticamente
      if (!activeMission && data && data.length > 0) {
        loadMissionData(data[0].MissionId);
      }
    }
    setLoadingMissions(false);
  }, [activeMission, loadMissionData]);

  useEffect(() => {
    loadMissions();
  }, [loadMissions]);

  // Manejo de drag & drop para el archivo
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExt = validExtensions.some((ext) => file.name.toLowerCase().endsWith(ext));

    if (!hasValidExt) {
      setUploadStatus({
        type: 'error',
        message: 'Formato no compatible. Por favor sube un archivo Excel (.xlsx, .xls) o .csv.',
      });
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadStatus({ type: 'idle', message: '' });
    if (!missionNameInput) {
      // Sugerir nombre predeterminado basado en el archivo
      const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
      setMissionNameInput(`Auditoría - ${cleanName}`);
    }
  };

  // Envío real a Supabase Edge Function: `ingest-excel`
  const handleUploadExcel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(15);
    setUploadStatus({ type: 'idle', message: '' });

    try {
      // Preparar FormData para invocar la Edge Function
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('depositCode', targetDeposit);
      formData.append('missionName', missionNameInput.trim() || selectedFile.name);

      setUploadProgress(40);

      // Invocar directamente la Edge Function ingest-excel en Supabase
      const { data, error } = await supabase.functions.invoke('ingest-excel', {
        body: formData,
      });

      setUploadProgress(80);

      if (error) {
        const errorText = error.message || 'Error en la ingesta del archivo';
        const isConflict =
          errorText.includes('409') ||
          errorText.toLowerCase().includes('hash') ||
          errorText.toLowerCase().includes('duplicado') ||
          errorText.toLowerCase().includes('duplicate');

        setUploadStatus({
          type: 'error',
          message: isConflict
            ? 'El Hash SHA-256 indica que este archivo ya fue procesado previamente en esta o en otra misión.'
            : `Fallo al procesar el archivo: ${errorText}`,
          details: error.message,
        });
        setUploadProgress(100);
        return;
      }

      setUploadProgress(100);
      setUploadStatus({
        type: 'success',
        message: `¡Archivo procesado exitosamente! Misión "${data?.missionName || missionNameInput}" creada con ${data?.totalSkus || 'los'} SKUs cargados.`,
      });

      // Limpiar archivo seleccionado
      setSelectedFile(null);
      setMissionNameInput('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Recargar lista de misiones y seleccionar la recién creada si viene el ID
      await loadMissions();
      if (data?.missionId) {
        await loadMissionData(data.missionId);
      }
    } catch (err) {
      console.error('[Ingest Excel Exception]', err);
      setUploadStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error inesperado durante la carga del archivo.',
      });
      setUploadProgress(100);
    } finally {
      setIsUploading(false);
    }
  };

  // Cálculo de progreso porcentual de la auditoría activa
  const coveragePercent =
    activeMission && activeMission.TotalSkus > 0
      ? Math.round((activeMission.CountedSkus / activeMission.TotalSkus) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* 4. Barra Superior: Indicador de Conectividad y Cola Offline */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          {/* Badge de Red */}
          <div
            onClick={() => setIsOnline(!isOnline)}
            title="Haz clic para alternar prueba de modo Online / Offline"
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center space-x-2 transition cursor-pointer select-none ${
              isOnline
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-amber-950/90 border-amber-500/60 text-amber-300 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
            <span>{isOnline ? 'En línea (Supabase Conectado)' : 'Modo Offline (AuditDB Activo)'}</span>
          </div>

          {/* Badge de Cola Offline */}
          <div
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center space-x-2 ${
              pendingOfflineCount > 0
                ? 'bg-indigo-950/80 border-indigo-500/50 text-indigo-300'
                : 'bg-slate-950/60 border-slate-800 text-slate-400'
            }`}
          >
            <CloudUpload className={`w-4 h-4 ${isSyncing ? 'animate-bounce text-indigo-400' : ''}`} />
            <span>
              {pendingOfflineCount > 0
                ? `Cola IndexedDB: ${pendingOfflineCount} pendiente${pendingOfflineCount > 1 ? 's' : ''}`
                : 'Cola Sincronizada (0 pendientes)'}
            </span>
          </div>
        </div>

        {/* Botón manual de sincronización de cola si hay pendientes y estamos online */}
        <div className="flex items-center space-x-2">
          {pendingOfflineCount > 0 && isOnline && (
            <button
              onClick={() => syncOfflineEvents()}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Forzar Sincronización'}</span>
            </button>
          )}

          <button
            onClick={() => {
              if (activeMission) loadMissionData(activeMission.MissionId);
              loadMissions();
            }}
            disabled={loadingMissions || isMissionLoading}
            className="p-2 text-slate-400 hover:text-white bg-slate-950/80 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs flex items-center space-x-1 transition disabled:opacity-50"
            title="Refrescar datos desde PostgreSQL"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingMissions || isMissionLoading ? 'animate-spin text-teal-400' : ''}`} />
            <span className="hidden sm:inline">Actualizar</span>
          </button>
        </div>
      </div>

      {/* Grid Principal: Panel de Ingesta (1) + Selector de Misiones (2) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 1. Panel de Ingesta de Archivos Excel */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-3 pb-2 border-b border-slate-800">
              <FileSpreadsheet className="w-5 h-5 text-teal-400" />
              <h2 className="font-bold text-sm text-white">Ingesta de Inventario Excel</h2>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Carga el archivo maestro (.xlsx, .xls o .csv). Se generará el Hash SHA-256 para prevenir cargas duplicadas y se aprovisionará la misión en PostgreSQL.
            </p>

            <form onSubmit={handleUploadExcel} className="space-y-4">
              {/* Selector de Depósito */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 uppercase">
                  Depósito Destino
                </label>
                <select
                  value={targetDeposit}
                  onChange={(e) => setTargetDeposit(e.target.value as DepositCode)}
                  disabled={isUploading}
                  className="w-full bg-slate-950 border border-slate-700 text-xs rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-teal-500 font-mono"
                >
                  <option value="150101">{DEPOSIT_NAMES['150101']}</option>
                  <option value="150103">{DEPOSIT_NAMES['150103']}</option>
                  <option value="150104">{DEPOSIT_NAMES['150104']}</option>
                </select>
              </div>

              {/* Nombre de la Misión */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1 uppercase">
                  Nombre de la Misión
                </label>
                <input
                  type="text"
                  value={missionNameInput}
                  onChange={(e) => setMissionNameInput(e.target.value)}
                  placeholder="Ej: Auditoría Semanal Almacén Central"
                  disabled={isUploading}
                  className="w-full bg-slate-950 border border-slate-700 text-xs rounded-lg px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500"
                />
              </div>

              {/* Área Drag & Drop */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 ${
                  isDragging
                    ? 'border-teal-400 bg-teal-950/20'
                    : selectedFile
                    ? 'border-emerald-500/60 bg-emerald-950/10'
                    : 'border-slate-700 hover:border-slate-600 bg-slate-950/40 hover:bg-slate-950/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInputChange}
                  className="hidden"
                />

                {selectedFile ? (
                  <div className="flex flex-col items-center">
                    <FileText className="w-8 h-8 text-emerald-400 mb-1" />
                    <span className="text-xs font-bold text-white truncate max-w-[240px]">
                      {selectedFile.name}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {(selectedFile.size / 1024).toFixed(1)} KB • Listo para procesar
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <UploadCloud className="w-8 h-8 text-teal-400 mb-1" />
                    <span className="text-xs font-semibold text-slate-300">
                      Haz clic o arrastra tu archivo aquí
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Soporta .XLSX, .XLS o .CSV maestro de existencias
                    </span>
                  </div>
                )}
              </div>

              {/* Barra de progreso de subida */}
              {isUploading && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-teal-400 flex items-center space-x-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Ejecutando Edge Function "ingest-excel"...</span>
                    </span>
                    <span className="text-slate-300 font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Mensajes de Confirmación o Error */}
              {uploadStatus.type === 'success' && (
                <div className="p-3 bg-emerald-950/80 border border-emerald-600/60 rounded-lg text-xs text-emerald-300 flex items-start space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{uploadStatus.message}</p>
                  </div>
                </div>
              )}

              {uploadStatus.type === 'error' && (
                <div className="p-3 bg-red-950/80 border border-red-700/60 rounded-lg text-xs text-red-300 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-semibold">{uploadStatus.message}</p>
                    {uploadStatus.details && (
                      <p className="text-[11px] text-red-400/80 font-mono mt-0.5">{uploadStatus.details}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Botón de Enviar */}
              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="w-full py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-bold text-xs rounded-lg shadow-lg shadow-teal-500/20 transition flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Procesando en Supabase...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Ingestar y Crear Misión</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* 2. Selector de Misiones Activas */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-emerald-400" />
                <h2 className="font-bold text-sm text-white">Misiones en Producción ("Read_Missions")</h2>
              </div>
              <span className="text-xs font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                {missionsList.length} registradas
              </span>
            </div>

            {missionsError && (
              <div className="p-3 bg-red-950/80 border border-red-800 rounded-lg text-xs text-red-200 mb-3 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{missionsError}</span>
              </div>
            )}

            {loadingMissions ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-teal-400" />
                <span className="text-xs font-mono">Consultando tabla "Read_Missions"...</span>
              </div>
            ) : missionsList.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
                <Boxes className="w-10 h-10 text-slate-700" />
                <p>No existen misiones activas en Supabase.</p>
                <p className="text-[11px] text-slate-600">
                  Usa el panel izquierdo para ingestar un inventario y comenzar una nueva auditoría.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {missionsList.map((m) => {
                  const isSelected = activeMission?.MissionId === m.MissionId;
                  const depCode = m.DepositCode as DepositCode;
                  const depositLabel = DEPOSIT_NAMES[depCode] || `Depósito ${m.DepositCode}`;
                  const progress = m.TotalSkus > 0 ? Math.round((m.CountedSkus / m.TotalSkus) * 100) : 0;

                  return (
                    <div
                      key={m.MissionId}
                      onClick={() => loadMissionData(m.MissionId)}
                      className={`p-3.5 rounded-xl border text-left cursor-pointer transition flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-slate-800/95 border-teal-500 shadow-md ring-1 ring-teal-500/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm text-white">{m.Name}</span>
                            {isSelected && (
                              <span className="px-2 py-0.5 text-[9px] font-extrabold uppercase bg-teal-500/20 text-teal-300 border border-teal-500/40 rounded-full">
                                Activa
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center space-x-1.5 mt-0.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            <span>{depositLabel}</span>
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase shrink-0 ${
                            m.Status === 'COMPLETED'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : m.Status === 'IN_PROGRESS'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {m.Status}
                        </span>
                      </div>

                      {/* Progreso de la misión */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono text-slate-400">
                          <span>
                            Contados: <strong className="text-slate-200">{m.CountedSkus}</strong> / {m.TotalSkus}
                          </span>
                          <span className="text-teal-400 font-bold">{progress}%</span>
                        </div>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-slate-800">
                          <div
                            className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* Métricas rápidas */}
                      <div className="grid grid-cols-4 gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono">
                        <div>
                          <span className="text-slate-500 block text-[9px]">TOTAL</span>
                          <span className="text-slate-300 font-semibold">{m.TotalSkus}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">PENDIENTES</span>
                          <span className="text-amber-400 font-semibold">{m.PendingSkus}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">DISCREPANCIAS</span>
                          <span className="text-red-400 font-semibold">{m.DiscrepantSkus}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">RECONCILIADOS</span>
                          <span className="text-cyan-400 font-semibold">{m.ReconciledSkus}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. Tarjetas de Métricas Globales en Tiempo Real (Zustand Store) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-teal-400" />
              <h2 className="text-base font-bold text-white">Métricas de la Misión Activa</h2>
            </div>
            {activeMission ? (
              <p className="text-xs text-slate-400 mt-0.5">
                Misión: <span className="text-teal-300 font-semibold">{activeMission.Name}</span> • Depósito{' '}
                <span className="font-mono text-slate-300">{activeMission.DepositCode}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-0.5">Selecciona una misión para ver los indicadores.</p>
            )}
          </div>

          {activeMission && (
            <div className="text-right">
              <span className="text-xs text-slate-400 block">Cobertura de Auditoría</span>
              <span className="text-lg font-black text-teal-400 font-mono">{coveragePercent}%</span>
            </div>
          )}
        </div>

        {activeMission ? (
          <div className="space-y-5">
            {/* Grid de 5 tarjetas clave */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Total SKUs */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 hover:border-slate-700 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-slate-400 uppercase font-semibold">Total SKUs</span>
                  <Boxes className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-white font-mono">
                  {activeMission.TotalSkus}
                </div>
                <span className="text-[10px] text-slate-500 mt-1 block">Universo auditado</span>
              </div>

              {/* SKUs Contados */}
              <div className="bg-slate-950 p-4 rounded-xl border border-emerald-900/40 hover:border-emerald-800/60 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-emerald-400 uppercase font-semibold">Contados</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-emerald-400 font-mono">
                  {activeMission.CountedSkus}
                </div>
                <span className="text-[10px] text-emerald-500/80 mt-1 block">
                  {coveragePercent}% completado
                </span>
              </div>

              {/* SKUs Pendientes */}
              <div className="bg-slate-950 p-4 rounded-xl border border-amber-900/40 hover:border-amber-800/60 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-amber-400 uppercase font-semibold">Pendientes</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                  {activeMission.PendingSkus}
                </div>
                <span className="text-[10px] text-amber-500/80 mt-1 block">Por verificar en anaquel</span>
              </div>

              {/* SKUs con Discrepancia */}
              <div className="bg-slate-950 p-4 rounded-xl border border-red-900/40 hover:border-red-800/60 transition">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-red-400 uppercase font-semibold">Discrepancias</span>
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-red-400 font-mono">
                  {activeMission.DiscrepantSkus}
                </div>
                <span className="text-[10px] text-red-400/80 mt-1 block">Faltantes o sobrantes</span>
              </div>

              {/* SKUs Reconciliados */}
              <div className="bg-slate-950 p-4 rounded-xl border border-cyan-900/40 hover:border-cyan-800/60 transition col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-cyan-400 uppercase font-semibold">Reconciliados</span>
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-black text-cyan-400 font-mono">
                  {activeMission.ReconciledSkus}
                </div>
                <span className="text-[10px] text-cyan-400/80 mt-1 block">Ajustados / Transferidos</span>
              </div>
            </div>

            {/* Barra de progreso visual de cobertura */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-300 font-medium">Progreso Global de Conteo Físico</span>
                <span className="font-mono text-teal-400 font-bold">
                  {activeMission.CountedSkus} de {activeMission.TotalSkus} SKUs ({coveragePercent}%)
                </span>
              </div>
              <div className="w-full bg-slate-900 h-3 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-400 h-full transition-all duration-500 shadow-sm"
                  style={{ width: `${coveragePercent}%` }}
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-500 font-mono pt-1">
                <span>Estado: {activeMission.Status}</span>
                <span>SHA-256: {activeMission.ExcelHashSHA256?.substring(0, 16)}...</span>
                <span>Última mod: {new Date(activeMission.UpdatedAt).toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-500 text-xs">
            No hay misión seleccionada. Selecciona una misión del listado superior o crea una nueva con el formulario de Excel.
          </div>
        )}
      </div>
    </div>
  );
};
