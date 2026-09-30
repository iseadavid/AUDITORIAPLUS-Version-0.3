import { useState } from 'react';
import {
  Database,
  ArrowRightLeft,
  Boxes,
  RefreshCw,
  AlertTriangle,
  Key,
  Search,
  Wifi,
  WifiOff,
  CloudUpload,
  Check,
  PackageCheck,
  ArrowDownToLine,
  X,
  LayoutDashboard,
  ClipboardList,
} from 'lucide-react';
import {
  isSupabaseConfigured,
  SUPABASE_URL,
  saveRuntimeCredentials,
  clearRuntimeCredentials,
} from './lib/supabase';
import { useMissionStore } from './store/useMissionStore';
import { MissionDashboardTab } from './components/dashboard/MissionDashboardTab';
import { WarehouseCountTab } from './components/warehouse/WarehouseCountTab';
import { ReconciliationAndReportsTab } from './components/reconciliation/ReconciliationAndReportsTab';

export default function App() {
  // Zustand Store
  const {
    activeMission,
    tasks,
    activeTask,
    floorDiscrepancies,
    virtualTransfers,
    isOnline,
    pendingOfflineCount,
    isLoading: storeLoading,
    isSyncing,
    error: storeError,
    setActiveTaskBySku,
    updateTaskCountLocally,
    syncOfflineEvents,
    setIsOnline,
    clearActiveTask,
  } = useMissionStore();

  // Pestaña activa principal de la PWA
  const [mainTab, setMainTab] = useState<'dashboard' | 'counting' | 'reconciliation'>('dashboard');

  // Estado del buscador SKU con regla LPAD
  const [skuSearchInput, setSkuSearchInput] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // Modal para registrar conteo del SKU
  const [countModalOpen, setCountModalOpen] = useState(false);
  const [inputCountedQty, setInputCountedQty] = useState<number | ''>('');
  const [inputSalesQty, setInputSalesQty] = useState<number | ''>(0);
  const [isSubmittingCount, setIsSubmittingCount] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{ msg: string; isOffline: boolean } | null>(null);

  // Modal de credenciales
  const [showConfigModal, setShowConfigModal] = useState(!isSupabaseConfigured);
  const [inputUrl, setInputUrl] = useState(SUPABASE_URL || '');
  const [inputKey, setInputKey] = useState('');

  // Manejar búsqueda con LPAD Cero-Izquierda
  const handleSearchSku = (term: string) => {
    setSkuSearchInput(term);
    if (!term.trim()) {
      clearActiveTask();
      setSearchFeedback(null);
      return;
    }

    const trimmed = term.trim();
    const isPadded = /^\d{1,5}$/.test(trimmed);
    const targetCode = isPadded ? trimmed.padStart(6, '0') : trimmed;

    const matched = setActiveTaskBySku(term);
    if (matched) {
      setSearchFeedback(
        isPadded
          ? `✓ SKU localizado con LPAD (6 dígitos): ${targetCode}`
          : `✓ SKU localizado: ${matched.SkuCode}`
      );
    } else {
      setSearchFeedback(
        isPadded
          ? `Buscando "${targetCode}" (LPAD)... Sin coincidencias en la misión.`
          : `Sin coincidencias para "${trimmed}".`
      );
    }
  };

  // Abrir modal de conteo para una tarea
  const openCountDialog = (task = activeTask) => {
    if (!task) return;
    setInputCountedQty(task.CountedQuantity !== null ? task.CountedQuantity : '');
    setInputSalesQty(task.SalesDuringAudit || 0);
    setSubmitFeedback(null);
    setCountModalOpen(true);
  };

  // Guardar conteo usando el método optimista offline-first del Store
  const handleSaveCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask || inputCountedQty === '') return;

    setIsSubmittingCount(true);
    const counted = Number(inputCountedQty);
    const sales = Number(inputSalesQty) || 0;

    const result = await updateTaskCountLocally(activeTask.TaskId, counted, sales);

    setIsSubmittingCount(false);
    if (result.success) {
      setSubmitFeedback({
        msg: result.offline
          ? 'Conteo registrado y encolado en IndexedDB (AuditDB).'
          : 'Conteo registrado y sincronizado en Supabase.',
        isOffline: result.offline,
      });

      setTimeout(() => {
        setCountModalOpen(false);
        setSubmitFeedback(null);
      }, 1300);
    } else {
      setSubmitFeedback({
        msg: result.error || 'Error al registrar el conteo.',
        isOffline: false,
      });
    }
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl || !inputKey) return;
    saveRuntimeCredentials(inputUrl, inputKey);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Barra de Navegación Superior */}
      <header className="border-b border-slate-800 bg-slate-900/95 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-teal-500/20 font-bold text-slate-950 text-lg">
              A+
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold tracking-tight text-white text-lg">AUDITORIAPLUS+</span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full">
                  Fase 2
                </span>
              </div>
              <p className="text-xs text-slate-400">PWA Offline-First • PostgreSQL Read Models • Edge Functions</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Toggle Conexión Online / Offline */}
            <button
              onClick={() => setIsOnline(!isOnline)}
              title="Haz clic para alternar prueba de modo Online / Offline"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition cursor-pointer ${
                isOnline
                  ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-amber-950/80 border-amber-600/70 text-amber-300 hover:bg-amber-900/80 animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </button>

            {/* Badge de Cola Offline con sincronización directa */}
            {pendingOfflineCount > 0 && (
              <button
                onClick={() => syncOfflineEvents()}
                disabled={isSyncing || !isOnline}
                title="Eventos encolados en IndexedDB pendientes de subir a Supabase"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-950/80 border border-indigo-700/80 text-indigo-300 text-xs font-semibold hover:bg-indigo-900/80 transition disabled:opacity-50"
              >
                <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce text-indigo-400' : ''}`} />
                <span>Cola: {pendingOfflineCount}</span>
              </button>
            )}

            <button
              onClick={() => setShowConfigModal(true)}
              className="p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-xs flex items-center space-x-1.5 transition"
              title="Configurar credenciales Supabase"
            >
              <Key className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline">Credenciales</span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner de arquitectura */}
      <div className="bg-slate-900 border-b border-slate-800/80 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5 text-slate-300">
              <Database className="w-3.5 h-3.5 text-teal-400" />
              <span>Read Model:</span>
              <code className="text-teal-300 font-mono">"Read_Missions"</code>
            </div>
            <span className="text-slate-600 hidden sm:inline">|</span>
            <div className="flex items-center space-x-1.5 text-slate-300">
              <ArrowDownToLine className="w-3.5 h-3.5 text-indigo-400" />
              <span>Offline:</span>
              <span className="text-indigo-300 font-semibold font-mono">AuditDB (IndexedDB v1)</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 font-mono text-[11px]">
            <span className="text-emerald-400">Edge Function: register-count &amp; ingest-excel</span>
          </div>
        </div>
      </div>

      {/* Mensaje de error si existe */}
      {storeError && (
        <div className="bg-amber-950/80 border-b border-amber-800/60 px-4 py-2.5 text-xs text-amber-200 flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{storeError}</span>
          </div>
        </div>
      )}

      {/* Navegación por Pestañas de la PWA */}
      <div className="border-b border-slate-800 bg-slate-950/60 sticky top-16 z-20 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-1">
          <button
            onClick={() => setMainTab('dashboard')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
              mainTab === 'dashboard'
                ? 'border-teal-400 text-teal-300 bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Tab 1: Dashboard &amp; Ingesta</span>
          </button>

          <button
            onClick={() => setMainTab('counting')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
              mainTab === 'counting'
                ? 'border-teal-400 text-teal-300 bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Tab 2: Conteo Físico ({tasks.length})</span>
          </button>

          <button
            onClick={() => setMainTab('reconciliation')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-bold border-b-2 transition flex items-center space-x-2 ${
              mainTab === 'reconciliation'
                ? 'border-cyan-400 text-cyan-300 bg-slate-900/40'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>Tab 3: Reconciliación &amp; Reportes ({floorDiscrepancies.length})</span>
          </button>
        </div>
      </div>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {mainTab === 'dashboard' ? (
          /* TAB 1: DASHBOARD DE MISIÓN & INGESTA EXCEL */
          <MissionDashboardTab />
        ) : mainTab === 'reconciliation' ? (
          /* TAB 3: RECONCILIACIÓN PISO, TRASLADOS VIRTUALES & REPORTES PDF */
          <ReconciliationAndReportsTab />
        ) : (
          /* TAB 2: TERMINAL DE CONTEO EN ALMACÉN */
          <div className="space-y-6">
            <WarehouseCountTab />

            {/* Listado Completo de Tareas de la Misión */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Boxes className="w-4 h-4 text-teal-400" />
                  <span>Maestro de Tareas ({tasks.length} SKUs)</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">
                  Misión: {activeMission?.Name}
                </span>
              </div>

              {tasks.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  No se encontraron tareas de conteo registradas para esta misión.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/40">
                        <th className="py-3 px-3">SKU / Descripción</th>
                        <th className="py-3 px-3">Depósito</th>
                        <th className="py-3 px-3 text-right">Cant. Sistema</th>
                        <th className="py-3 px-3 text-right">Ventas Audit</th>
                        <th className="py-3 px-3 text-right">Cant. Contada</th>
                        <th className="py-3 px-3 text-right">Discrepancia</th>
                        <th className="py-3 px-3 text-center">Estado</th>
                        <th className="py-3 px-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-sans">
                      {tasks.map((task) => (
                        <tr
                          key={task.TaskId}
                          className={`hover:bg-slate-800/40 transition ${
                            activeTask?.TaskId === task.TaskId ? 'bg-teal-950/20' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <div className="font-semibold text-white">{task.SkuCode}</div>
                            <div className="text-slate-400 text-[11px] truncate max-w-xs">{task.SkuDescription}</div>
                            {task.Barcodes && task.Barcodes.length > 0 && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                BC: {task.Barcodes.join(', ')}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-3 font-mono text-slate-300">{task.DepositCode}</td>
                          <td className="py-3 px-3 text-right font-mono text-slate-200">{task.SystemQuantity}</td>
                          <td className="py-3 px-3 text-right font-mono text-amber-300/90">{task.SalesDuringAudit}</td>
                          <td className="py-3 px-3 text-right font-mono font-bold text-white">
                            {task.CountedQuantity !== null ? task.CountedQuantity : '-'}
                          </td>
                          <td
                            className={`py-3 px-3 text-right font-mono font-bold ${
                              task.Discrepancy === 0
                                ? 'text-emerald-400'
                                : task.Discrepancy < 0
                                ? 'text-red-400'
                                : 'text-amber-400'
                            }`}
                          >
                            {task.Discrepancy > 0 ? `+${task.Discrepancy}` : task.Discrepancy}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                task.Status === 'COMPLETED'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : task.Status === 'DISCREPANT'
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                                  : task.Status === 'RECONCILED'
                                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                  : 'bg-slate-800 text-slate-300 border border-slate-700'
                              }`}
                            >
                              {task.Status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            <button
                              onClick={() => {
                                setActiveTaskBySku(task.SkuCode);
                                window.scrollTo({ top: 120, behavior: 'smooth' });
                              }}
                              className="px-2.5 py-1 bg-slate-800 hover:bg-teal-600 hover:text-slate-950 text-teal-300 rounded font-semibold text-[11px] transition"
                            >
                              Cargar en Terminal
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Modal para Registrar Conteo de SKU (Optimistic + Offline-First) */}
      {countModalOpen && activeTask && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <PackageCheck className="w-5 h-5 text-teal-400" />
                <h3 className="text-base font-bold text-white">Registrar Conteo de SKU</h3>
              </div>
              <button
                onClick={() => setCountModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-white text-sm">{activeTask.SkuCode}</span>
                <span className="text-slate-400">Dep: {activeTask.DepositCode}</span>
              </div>
              <p className="text-slate-300 mt-1">{activeTask.SkuDescription}</p>
              <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between text-slate-400 font-mono">
                <span>Stock Sistema: <strong className="text-slate-200">{activeTask.SystemQuantity}</strong></span>
                <span>Costo: ${activeTask.Cost.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSaveCount} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Cantidad Física Contada en Almacén
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  autoFocus
                  value={inputCountedQty}
                  onChange={(e) => setInputCountedQty(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="Ej: 45"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-lg text-white font-mono font-bold focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                  Ventas Registradas Durante la Auditoría
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={inputSalesQty}
                  onChange={(e) => setInputSalesQty(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-teal-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Fórmula: Discrepancia = (Contado + Ventas) - Sistema
                </p>
              </div>

              {submitFeedback && (
                <div
                  className={`p-2.5 rounded-lg text-xs font-mono flex items-center space-x-2 ${
                    submitFeedback.isOffline
                      ? 'bg-amber-950/80 border border-amber-700 text-amber-300'
                      : 'bg-emerald-950/80 border border-emerald-700 text-emerald-300'
                  }`}
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{submitFeedback.msg}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-slate-800">
                <div className="text-[11px] text-slate-400 flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  <span>{isOnline ? 'Sincronizará directo' : 'Guardará en IndexedDB'}</span>
                </div>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setCountModalOpen(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingCount}
                    className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-lg shadow transition flex items-center space-x-1 disabled:opacity-50"
                  >
                    {isSubmittingCount ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Guardar Conteo</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Configuración de Credenciales */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center space-x-3 mb-4 pb-3 border-b border-slate-800">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Conexión a Supabase</h3>
                <p className="text-xs text-slate-400">AUDITORIAPLUS+ Fase 2</p>
              </div>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  VITE_SUPABASE_URL
                </label>
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  VITE_SUPABASE_ANON_KEY
                </label>
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  required
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-teal-500 font-mono"
                />
              </div>

              <div className="text-xs text-slate-400 bg-slate-950/70 p-3 rounded-lg border border-slate-800 space-y-1">
                <p className="font-medium text-slate-300">Reglas de Conexión:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                  <li>Lectura directa de tablas: <code className="text-teal-400">"Read_Missions"</code></li>
                  <li>Mutaciones ejecutadas exclusivamente via Supabase Edge Function <code className="text-teal-400">ingest-excel</code> y <code className="text-teal-400">register-count</code>.</li>
                  <li>Almacenamiento offline en IndexedDB con reconciliación automática al reconectar.</li>
                </ul>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => {
                    clearRuntimeCredentials();
                  }}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Limpiar credenciales
                </button>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-slate-950 text-xs font-bold rounded-lg shadow transition"
                  >
                    Guardar y Conectar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <p>AUDITORIAPLUS+ Fase 2 • PWA de Reconciliación de Inventario • PostgreSQL &amp; Supabase Edge Functions</p>
      </footer>
    </div>
  );
}
