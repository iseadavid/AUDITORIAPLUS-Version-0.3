import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Barcode,
  Search,
  CheckCircle2,
  AlertTriangle,
  Package,
  Layers,
  Check,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Hash,
  DollarSign,
  ArrowRight,
  Wifi,
  WifiOff,
  CloudUpload,
  RefreshCw,
  Clock,
  ShieldAlert,
  Building2,
} from 'lucide-react';
import { useMissionStore } from '../../store/useMissionStore';
import { MissionTask, TaskStatus } from '../../types/audit';

export const WarehouseCountTab: React.FC = () => {
  const {
    activeMission,
    tasks,
    activeTask,
    isOnline,
    pendingOfflineCount,
    setActiveTaskBySku,
    updateTaskCountLocally,
    clearActiveTask,
  } = useMissionStore();

  // Estados de entrada y escaneo
  const [searchInput, setSearchInput] = useState('');
  const [searchFeedback, setSearchFeedback] = useState<{
    type: 'success' | 'warning' | 'error' | 'idle';
    text: string;
  }>({ type: 'idle', text: '' });

  // Estados del formulario de captura rápida
  const [countedQtyInput, setCountedQtyInput] = useState<string>('');
  const [salesQtyInput, setSalesQtyInput] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'online' | 'offline' | 'error';
    text: string;
    discrepancyVal?: number;
  } | null>(null);

  // Teclado numérico / Foco
  const [activeInputFocus, setActiveInputFocus] = useState<'counted' | 'sales'>('counted');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const countedInputRef = useRef<HTMLInputElement>(null);

  // Enfocar buscador al montar el componente
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Al seleccionar o cambiar la tarea activa en el store, sincronizar campos
  useEffect(() => {
    if (activeTask) {
      setCountedQtyInput(activeTask.CountedQuantity !== null ? String(activeTask.CountedQuantity) : '');
      setSalesQtyInput(String(activeTask.SalesDuringAudit || 0));
      setSubmitFeedback(null);
      // Foco inmediato al input de conteo para rapidez con lector óptico o teclado
      setTimeout(() => {
        countedInputRef.current?.focus();
        countedInputRef.current?.select();
      }, 50);
    } else {
      setCountedQtyInput('');
      setSalesQtyInput('0');
    }
  }, [activeTask]);

  // Manejo de búsqueda por SKU / Código de barras con regla LPAD
  const handleSearch = useCallback(
    (term: string) => {
      setSearchInput(term);
      if (!term.trim()) {
        clearActiveTask();
        setSearchFeedback({ type: 'idle', text: '' });
        return;
      }

      const raw = term.trim();
      const isNumericShort = /^\d{1,5}$/.test(raw);
      const lpadSku = isNumericShort ? raw.padStart(6, '0') : raw;

      const found = setActiveTaskBySku(raw);

      if (found) {
        setSearchFeedback({
          type: 'success',
          text: isNumericShort
            ? `SKU localizado mediante LPAD 6 dígitos: "${lpadSku}"`
            : `SKU localizado: "${found.SkuCode}"`,
        });
      } else {
        setSearchFeedback({
          type: 'warning',
          text: isNumericShort
            ? `Buscado "${lpadSku}" (LPAD de ${raw}). No existe en el maestro de esta misión.`
            : `No se encontró ningún SKU o código de barras con "${raw}".`,
        });
      }
    },
    [setActiveTaskBySku, clearActiveTask]
  );

  // Manejo del Enter en el buscador (típico de pistola lectora de código de barras USB/Bluetooth)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearch(searchInput);
      if (activeTask) {
        countedInputRef.current?.focus();
        countedInputRef.current?.select();
      }
    }
  };

  // Cálculo inmediato de discrepancia en tiempo real:
  // Discrepancia = (Cantidad Contada + Ventas durante Auditoría) - Cantidad del Sistema
  const parsedCounted = countedQtyInput === '' ? null : Number(countedQtyInput);
  const parsedSales = Number(salesQtyInput) || 0;
  const theoreticalSystem = activeTask ? activeTask.SystemQuantity : 0;

  const currentDiscrepancy =
    parsedCounted !== null ? parsedCounted + parsedSales - theoreticalSystem : null;

  // Manejo del teclado virtual numérico en pantalla (óptimo para colectores de datos táctiles)
  const handleKeypadPress = (val: string) => {
    const isCounted = activeInputFocus === 'counted';
    const currentVal = isCounted ? countedQtyInput : salesQtyInput;

    if (val === 'BACK') {
      const updated = currentVal.slice(0, -1);
      if (isCounted) setCountedQtyInput(updated);
      else setSalesQtyInput(updated);
      return;
    }

    if (val === 'CLEAR') {
      if (isCounted) setCountedQtyInput('');
      else setSalesQtyInput('0');
      return;
    }

    const updated = currentVal === '0' && val !== '.' ? val : currentVal + val;
    if (isCounted) setCountedQtyInput(updated);
    else setSalesQtyInput(updated);
  };

  // Enviar y Registrar Conteo
  const handleSubmitCount = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeTask || parsedCounted === null || isNaN(parsedCounted)) return;

    setIsSubmitting(true);
    setSubmitFeedback(null);

    try {
      const result = await updateTaskCountLocally(
        activeTask.TaskId,
        parsedCounted,
        parsedSales
      );

      if (result.success) {
        setSubmitFeedback({
          type: result.offline ? 'offline' : 'online',
          text: result.offline
            ? 'Conteo guardado en IndexedDB (AuditDB). Se sincronizará al volver online.'
            : 'Conteo registrado y sincronizado en Supabase.',
          discrepancyVal: currentDiscrepancy !== null ? currentDiscrepancy : undefined,
        });

        // Limpiar para el siguiente escaneo
        setTimeout(() => {
          setSearchInput('');
          setSearchFeedback({ type: 'idle', text: '' });
          clearActiveTask();
          setCountedQtyInput('');
          setSalesQtyInput('0');
          searchInputRef.current?.focus();
        }, 1200);
      } else {
        setSubmitFeedback({
          type: 'error',
          text: result.error || 'Ocurrió un error al registrar el conteo.',
        });
      }
    } catch (err) {
      console.error('[WarehouseCountTab Submit Error]', err);
      setSubmitFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error inesperado al registrar el conteo.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeMission) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center max-w-xl mx-auto shadow-xl">
        <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-white mb-1">Sin Misión Activa Seleccionada</h2>
        <p className="text-xs text-slate-400 mb-4">
          Para realizar conteos físicos en almacén, por favor selecciona o ingesta una misión en la pestaña <strong>"Tab 1: Dashboard &amp; Ingesta"</strong>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Indicador Superior Rápido de Terminal de Conteo */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 shadow-md flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-teal-500/10 border border-teal-500/30 rounded-lg text-teal-400">
            <Barcode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Misión: {activeMission.Name}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-800 text-teal-300 border border-slate-700 rounded">
                Dep. {activeMission.DepositCode}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Universo: {activeMission.TotalSkus} SKUs • Contados: {activeMission.CountedSkus} • Pendientes: {activeMission.PendingSkus}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Badge Online/Offline */}
          <div
            className={`px-2.5 py-1 rounded-lg border text-xs font-mono font-semibold flex items-center space-x-1.5 ${
              isOnline
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-amber-950/90 border-amber-500/60 text-amber-300 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          {/* Badge Cola Offline */}
          {pendingOfflineCount > 0 && (
            <div className="px-2.5 py-1 rounded-lg border border-indigo-500/60 bg-indigo-950/90 text-indigo-300 text-xs font-mono font-bold flex items-center space-x-1">
              <CloudUpload className="w-3.5 h-3.5" />
              <span>Cola: {pendingOfflineCount}</span>
            </div>
          )}
        </div>
      </div>

      {/* 1. Barra de Búsqueda y Escáner de SKU / Código de Barras */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl">
        <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5 flex items-center justify-between">
          <span className="flex items-center space-x-1.5">
            <Search className="w-4 h-4 text-teal-400" />
            <span>Escaneo de Código de Barras o SKU Manual</span>
          </span>
          <span className="text-[10px] text-teal-400 font-mono lowercase">
            LPAD automático: 1-5 dígitos ➔ 6 dígitos
          </span>
        </label>

        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="Escanea con el lector o ingresa código (ej: 42 ➔ busca 000042)..."
            className="w-full bg-slate-950 border-2 border-slate-700 focus:border-teal-400 rounded-xl px-4 py-3 text-base sm:text-lg font-mono text-white placeholder-slate-600 focus:outline-none transition shadow-inner"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput('');
                clearActiveTask();
                setSearchFeedback({ type: 'idle', text: '' });
                searchInputRef.current?.focus();
              }}
              className="absolute right-3 top-3 text-slate-400 hover:text-white p-1"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {searchFeedback.type !== 'idle' && (
          <div
            className={`mt-2 px-3 py-1.5 rounded-lg text-xs font-mono flex items-center space-x-2 ${
              searchFeedback.type === 'success'
                ? 'bg-emerald-950/70 border border-emerald-700/60 text-emerald-300'
                : 'bg-amber-950/70 border border-amber-700/60 text-amber-300'
            }`}
          >
            {searchFeedback.type === 'success' ? (
              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span>{searchFeedback.text}</span>
          </div>
        )}
      </div>

      {/* Grid: 2. Ficha Técnica del Producto (Izq) + 3. Teclado y Captura (Der) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 2. Ficha Técnica del Producto Seleccionado */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <div className="flex items-center space-x-2">
                <Package className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Ficha Técnica de SKU
                </h3>
              </div>
              {activeTask && (
                <span
                  className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full uppercase tracking-wider font-mono ${
                    activeTask.Status === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : activeTask.Status === 'DISCREPANT'
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : activeTask.Status === 'RECONCILED'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {activeTask.Status}
                </span>
              )}
            </div>

            {activeTask ? (
              <div className="space-y-4">
                {/* Código SKU y Nombre */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                    Código SKU
                  </span>
                  <div className="text-2xl font-black text-white font-mono tracking-wide">
                    {activeTask.SkuCode}
                  </div>
                  <p className="text-sm text-slate-300 font-medium mt-1 leading-snug">
                    {activeTask.SkuDescription}
                  </p>
                </div>

                {/* Códigos de Barra Asociados */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-mono block mb-1.5 flex items-center space-x-1">
                    <Barcode className="w-3.5 h-3.5 text-teal-400" />
                    <span>Códigos de Barra ({activeTask.Barcodes?.length || 0})</span>
                  </span>
                  {activeTask.Barcodes && activeTask.Barcodes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {activeTask.Barcodes.map((bc, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono rounded"
                        >
                          {bc}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic">Sin códigos de barra mapeados</span>
                  )}
                </div>

                {/* Cantidad Teórica en Sistema y Costo */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Stock Sistema
                    </span>
                    <span className="text-2xl font-black text-teal-300 font-mono">
                      {activeTask.SystemQuantity}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Teórico esperado</span>
                  </div>

                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
                    <span className="text-[10px] text-slate-400 uppercase font-semibold block">
                      Costo Unitario
                    </span>
                    <span className="text-2xl font-black text-slate-200 font-mono">
                      ${activeTask.Cost.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">Valoración de inventario</span>
                  </div>
                </div>

                {/* Último conteo guardado */}
                <div className="text-[11px] text-slate-400 font-mono pt-2 border-t border-slate-800 flex justify-between">
                  <span>Conteo previo: <strong className="text-white">{activeTask.CountedQuantity !== null ? activeTask.CountedQuantity : 'Ninguno'}</strong></span>
                  <span>Discrepancia: <strong className={activeTask.Discrepancy === 0 ? 'text-emerald-400' : 'text-red-400'}>{activeTask.Discrepancy}</strong></span>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center text-slate-500 flex flex-col items-center justify-center space-y-2">
                <Barcode className="w-12 h-12 text-slate-700" />
                <p className="text-xs">
                  Escanea un código de barras o escribe el SKU para visualizar la ficha y cargar el conteo.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 3. Teclado Numérico y Captura Físico / Ventas */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <form onSubmit={handleSubmitCount} className="space-y-4">
            {/* Inputs de Captura Rápida */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Cantidad Física Contada */}
              <div
                onClick={() => {
                  setActiveInputFocus('counted');
                  countedInputRef.current?.focus();
                }}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer ${
                  activeInputFocus === 'counted'
                    ? 'border-teal-400 bg-teal-950/20'
                    : 'border-slate-800 bg-slate-950'
                }`}
              >
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  1. Cantidad Física Contada
                </label>
                <input
                  ref={countedInputRef}
                  type="number"
                  min="0"
                  step="1"
                  required
                  disabled={!activeTask}
                  value={countedQtyInput}
                  onFocus={() => setActiveInputFocus('counted')}
                  onChange={(e) => setCountedQtyInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-3xl font-black text-white font-mono focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 font-mono block mt-1">
                  Existencia física en anaquel
                </span>
              </div>

              {/* Ventas Ocurridas Durante Auditoría */}
              <div
                onClick={() => setActiveInputFocus('sales')}
                className={`p-3.5 rounded-xl border-2 transition cursor-pointer ${
                  activeInputFocus === 'sales'
                    ? 'border-teal-400 bg-teal-950/20'
                    : 'border-slate-800 bg-slate-950'
                }`}
              >
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  2. Ventas Durante Auditoría
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  disabled={!activeTask}
                  value={salesQtyInput}
                  onFocus={() => setActiveInputFocus('sales')}
                  onChange={(e) => setSalesQtyInput(e.target.value)}
                  placeholder="0"
                  className="w-full bg-transparent text-3xl font-black text-amber-300 font-mono focus:outline-none"
                />
                <span className="text-[10px] text-slate-500 font-mono block mt-1">
                  Salidas registradas en caja
                </span>
              </div>
            </div>

            {/* Cálculo de Discrepancia Inmediata */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-400 uppercase font-bold block">
                  Discrepancia Resultante
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  (Contado + Ventas) - Sistema
                </span>
              </div>

              <div className="text-right">
                {currentDiscrepancy !== null ? (
                  <div className="flex items-center space-x-2">
                    {currentDiscrepancy === 0 ? (
                      <span className="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-lg text-lg font-black font-mono flex items-center space-x-1">
                        <Check className="w-4 h-4" />
                        <span>0 (Exacto)</span>
                      </span>
                    ) : currentDiscrepancy < 0 ? (
                      <span className="px-2.5 py-1 bg-red-500/20 text-red-400 border border-red-500/40 rounded-lg text-lg font-black font-mono flex items-center space-x-1">
                        <TrendingDown className="w-4 h-4" />
                        <span>{currentDiscrepancy} (Faltante)</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded-lg text-lg font-black font-mono flex items-center space-x-1">
                        <TrendingUp className="w-4 h-4" />
                        <span>+{currentDiscrepancy} (Sobrante)</span>
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-slate-600 font-mono font-medium">
                    Ingresa el conteo físico
                  </span>
                )}
              </div>
            </div>

            {/* Teclado Numérico Táctil Rápido (Optimizador Industrial) */}
            <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
              <div className="text-[10px] text-slate-400 uppercase font-mono mb-2 flex justify-between">
                <span>Teclado Numérico Industrial</span>
                <span className="text-teal-400">
                  Editando: {activeInputFocus === 'counted' ? 'Cantidad Contada' : 'Ventas'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {['7', '8', '9', 'BACK', '4', '5', '6', 'CLEAR', '1', '2', '3', '0'].map((btn) => (
                  <button
                    key={btn}
                    type="button"
                    disabled={!activeTask}
                    onClick={() => handleKeypadPress(btn)}
                    className={`py-3 rounded-lg font-mono font-bold text-sm transition select-none disabled:opacity-30 ${
                      btn === 'BACK'
                        ? 'bg-red-950/60 border border-red-800 text-red-300 hover:bg-red-900/80'
                        : btn === 'CLEAR'
                        ? 'bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700'
                        : 'bg-slate-900 border border-slate-800 text-white hover:bg-slate-800 hover:border-teal-500 active:scale-95'
                    }`}
                  >
                    {btn === 'BACK' ? '⌫ Borrar' : btn === 'CLEAR' ? 'Limpiar' : btn}
                  </button>
                ))}
              </div>
            </div>

            {/* Mensajes de feedback */}
            {submitFeedback && (
              <div
                className={`p-3 rounded-xl text-xs font-mono flex items-center space-x-2 ${
                  submitFeedback.type === 'online'
                    ? 'bg-emerald-950/80 border border-emerald-600 text-emerald-300'
                    : submitFeedback.type === 'offline'
                    ? 'bg-amber-950/80 border border-amber-600 text-amber-300'
                    : 'bg-red-950/80 border border-red-600 text-red-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{submitFeedback.text}</span>
              </div>
            )}

            {/* 4. Botón de Confirmación y Registro */}
            <button
              type="submit"
              disabled={!activeTask || parsedCounted === null || isSubmitting}
              className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-sm uppercase tracking-wider rounded-xl shadow-lg shadow-teal-500/20 transition flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-98"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Procesando Conteo...</span>
                </>
              ) : (
                <>
                  <Check className="w-5 h-5 stroke-[3]" />
                  <span>Registrar Conteo de SKU</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
