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
  FileText,
} from 'lucide-react';
import {
  isSupabaseConfigured,
  SUPABASE_URL,
  saveRuntimeCredentials,
  clearRuntimeCredentials,
} from './lib/supabase';
import { useMissionStore } from './store/useMissionStore';
import { WarehouseMissionTab } from './components/warehouse/WarehouseMissionTab';
import { DiscrepanciesTab } from './components/reconciliation/DiscrepanciesTab';
import { ReportsTab } from './components/reports/ReportsTab';

export default function App() {
  // Zustand Store
  const {
    activeMission,
    tasks,
    isOnline,
    pendingOfflineCount,
    isLoading: storeLoading,
    isSyncing,
    error: storeError,
    syncOfflineEvents,
    setIsOnline,
  } = useMissionStore();

  // Pestaña activa principal de la PWA (Exactamente 3 pestañas requeridas)
  const [mainTab, setMainTab] = useState<'warehouse' | 'discrepancies' | 'reports'>('warehouse');

  // Modal de credenciales
  const [showConfigModal, setShowConfigModal] = useState(!isSupabaseConfigured);
  const [inputUrl, setInputUrl] = useState(SUPABASE_URL || '');
  const [inputKey, setInputKey] = useState('');

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl || !inputKey) return;
    saveRuntimeCredentials(inputUrl, inputKey);
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-gray-900 flex flex-col font-sans">
      {/* Barra de Navegación Superior (Navy #263988) */}
      <header className="border-b border-gray-200 bg-[#263988] text-white sticky top-0 z-30 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-[#009045] flex items-center justify-center shadow-lg font-black text-white text-lg">
              A+
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-black tracking-tight text-white text-lg">AUDITORIAPLUS+</span>
                <span className="px-2 py-0.5 text-xs font-bold bg-[#009045] text-white rounded-full">
                  PWA
                </span>
              </div>
              <p className="text-xs text-blue-200">Reconciliación y Auditoría Industrial</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Toggle Conexión Online / Offline */}
            <button
              onClick={() => setIsOnline(!isOnline)}
              title="Alternar prueba de modo Online / Offline"
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer select-none ${
                isOnline
                  ? 'bg-emerald-950/40 border-emerald-400 text-emerald-300 hover:bg-emerald-900/60'
                  : 'bg-[#FEF3C7] border-[#D97706] text-[#D97706] animate-pulse'
              }`}
            >
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-400" /> : <WifiOff className="w-3.5 h-3.5 text-[#D97706]" />}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </button>

            {/* Badge de Cola Offline con sincronización */}
            {pendingOfflineCount > 0 && (
              <button
                onClick={() => syncOfflineEvents()}
                disabled={isSyncing || !isOnline}
                title="Eventos encolados en IndexedDB pendientes de sincronizar"
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-bold hover:bg-white/20 transition disabled:opacity-50"
              >
                <CloudUpload className={`w-3.5 h-3.5 ${isSyncing ? 'animate-bounce text-emerald-300' : ''}`} />
                <span>Cola: {pendingOfflineCount}</span>
              </button>
            )}

            <button
              onClick={() => setShowConfigModal(true)}
              className="p-2 text-white hover:bg-white/10 rounded-lg border border-white/20 text-xs flex items-center space-x-1.5 transition"
              title="Configurar credenciales Supabase"
            >
              <Key className="w-4 h-4 text-emerald-300" />
              <span className="hidden md:inline font-semibold">Credenciales</span>
            </button>
          </div>
        </div>
      </header>

      {/* Banner de arquitectura */}
      <div className="bg-white border-b border-gray-200 text-xs text-gray-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1.5 text-gray-700">
              <Database className="w-3.5 h-3.5 text-[#263988]" />
              <span>Read Model:</span>
              <code className="text-[#263988] font-mono font-bold">"Read_Missions"</code>
            </div>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <div className="flex items-center space-x-1.5 text-gray-700">
              <ArrowDownToLine className="w-3.5 h-3.5 text-[#009045]" />
              <span>Offline:</span>
              <span className="text-[#009045] font-semibold font-mono">AuditDB (IndexedDB v1)</span>
            </div>
          </div>
          <div className="flex items-center space-x-2 font-mono text-[11px] text-gray-600">
            <span>Edge Functions: register-count • ingest-excel • register-floor-count • reports-pdf</span>
          </div>
        </div>
      </div>

      {/* Mensaje de error si existe */}
      {storeError && (
        <div className="bg-[#FEF3C7] border-b border-[#D97706]/40 px-4 py-2.5 text-xs text-[#D97706] flex items-center justify-between max-w-7xl mx-auto w-full">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0" />
            <span>{storeError}</span>
          </div>
        </div>
      )}

      {/* NAVEGACIÓN PRINCIPAL: EXACTAMENTE 3 PESTAÑAS (TABS) */}
      <div className="border-b border-gray-200 bg-white sticky top-16 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2">
          {/* TAB 1: MISIÓN ALMACÉN */}
          <button
            onClick={() => setMainTab('warehouse')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-black border-b-2 transition flex items-center space-x-2 cursor-pointer ${
              mainTab === 'warehouse'
                ? 'border-[#009045] text-[#009045] bg-emerald-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>Tab 1: Misión Almacén</span>
          </button>

          {/* TAB 2: DISCREPANCIAS / PISO */}
          <button
            onClick={() => setMainTab('discrepancies')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-black border-b-2 transition flex items-center space-x-2 cursor-pointer ${
              mainTab === 'discrepancies'
                ? 'border-[#D97706] text-[#D97706] bg-[#FEF3C7]/40'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Tab 2: Discrepancias / Piso</span>
          </button>

          {/* TAB 3: PDF / REP. */}
          <button
            onClick={() => setMainTab('reports')}
            className={`py-3.5 px-4 text-xs sm:text-sm font-black border-b-2 transition flex items-center space-x-2 cursor-pointer ${
              mainTab === 'reports'
                ? 'border-[#263988] text-[#263988] bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Tab 3: PDF / Rep.</span>
          </button>
        </div>
      </div>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full">
        {mainTab === 'warehouse' && (
          /* TAB 1: Misión Almacén (Métricas, Normalización LPAD 6 dígitos, Card de Producto Activo y Captura) */
          <WarehouseMissionTab />
        )}

        {mainTab === 'discrepancies' && (
          /* TAB 2: Discrepancias / Piso (useDiscrepancyStore y Modal de Conteo en Piso) */
          <DiscrepanciesTab />
        )}

        {mainTab === 'reports' && (
          /* TAB 3: PDF / Rep. (Resumen financiero de valor auditado y botón gigante Navy #263988) */
          <ReportsTab />
        )}
      </main>

      {/* Modal de Configuración de Credenciales */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center space-x-3 mb-4 pb-3 border-b border-gray-200">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-[#263988]">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Conexión a Supabase</h3>
                <p className="text-xs text-gray-500">AUDITORIAPLUS+ PWA</p>
              </div>
            </div>

            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  VITE_SUPABASE_URL
                </label>
                <input
                  type="text"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  placeholder="https://xyzcompany.supabase.co"
                  required
                  className="w-full bg-[#F3F4F6] border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#263988] font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  VITE_SUPABASE_ANON_KEY
                </label>
                <input
                  type="password"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  required
                  className="w-full bg-[#F3F4F6] border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#263988] font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => clearRuntimeCredentials()}
                  className="text-xs text-red-600 hover:text-red-700 font-semibold"
                >
                  Limpiar credenciales
                </button>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowConfigModal(false)}
                    className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-lg transition"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#009045] hover:bg-[#007a3a] text-white text-xs font-bold rounded-lg shadow transition"
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
      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-500 mt-auto">
        <p>AUDITORIAPLUS+ PWA • #009045 Verde CTA • #263988 Azul Navy • #D97706 Ámbar Discrepancias • #F3F4F6 Fondo</p>
      </footer>
    </div>
  );
}
