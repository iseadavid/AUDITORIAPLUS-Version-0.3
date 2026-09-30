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
  ArrowRight,
  Wifi,
  WifiOff,
  CloudUpload,
  RefreshCw,
  Clock,
  ShieldAlert,
  Building2,
  X,
} from 'lucide-react';
import { useMissionStore } from '../../store/useMissionStore';
import { MissionDashboardTab } from '../dashboard/MissionDashboardTab';

export const WarehouseMissionTab: React.FC = () => {
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
  
  // Toast Banner Flotante Ámbar para alertas no bloqueantes
  const [floatingToast, setFloatingToast] = useState<{
    show: boolean;
    text: string;
    type: 'amber' | 'green';
  }>({ show: false, text: '', type: 'amber' });

  // Estados del formulario de captura rápida
  const [countedQtyInput, setCountedQtyInput] = useState<string>('');
  const [salesQtyInput, setSalesQtyInput] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'online' | 'offline' | 'error';
    text: string;
    discrepancyVal?: number;
  } | null>(null);

  // Foco
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
      setTimeout(() => {
        countedInputRef.current?.focus();
        countedInputRef.current?.select();
      }, 50);
    } else {
      setCountedQtyInput('');
      setSalesQtyInput('0');
    }
  }, [activeTask]);

  // Toast auto-hide
  const triggerToast = (text: string, type: 'amber' | 'green' = 'amber') => {
    setFloatingToast({ show: true, text, type });
    setTimeout(() => {
      setFloatingToast((prev) => ({ ...prev, show: false }));
    }, 4500);
  };

  // Manejo de búsqueda por SKU / Código de barras con regla LPAD
  const handleSearch = useCallback(
    (term: string) => {
      setSearchInput(term);
      if (!term.trim()) {
        clearActiveTask();
        return;
      }

      const raw = term.trim();
      const isNumericShort = /^\d{1,5}$/.test(raw);
      const lpadSku = isNumericShort ? raw.padStart(6, '0') : raw;

      const found = setActiveTaskBySku(raw);

      if (found) {
        triggerToast(
          isNumericShort
            ? `✓ SKU normalizado con LPAD (6 dígitos): ${lpadSku} localizado.`
            : `✓ SKU localizado: ${found.SkuCode}.`,
          'green'
        );
      } else {
        // Alerta con Toast Banner Flotante Ámbar NO bloqueante
        triggerToast(
          isNumericShort
            ? `Buscado "${lpadSku}" (LPAD de ${raw}). Sin coincidencias en la misión activa.`
            : `No se encontró ningún SKU o código de barras para "${raw}".`,
          'amber'
        );
      }
    },
    [setActiveTaskBySku, clearActiveTask]
  );

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

  // Manejo del teclado virtual numérico en pantalla
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
            ? 'Conteo registrado y encolado en IndexedDB (AuditDB).'
            : 'Conteo registrado y sincronizado en Supabase.',
          discrepancyVal: currentDiscrepancy !== null ? currentDiscrepancy : undefined,
        });

        triggerToast(
          `Conteo guardado para SKU ${activeTask.SkuCode}. Preparado para el siguiente escaneo.`,
          'green'
        );

        setTimeout(() => {
          setSearchInput('');
          clearActiveTask();
          setCountedQtyInput('');
          setSalesQtyInput('0');
          searchInputRef.current?.focus();
        }, 1100);
      } else {
        setSubmitFeedback({
          type: 'error',
          text: result.error || 'Ocurrió un error al registrar el conteo.',
        });
        triggerToast(result.error || 'Error al guardar conteo.', 'amber');
      }
    } catch (err) {
      console.error('[WarehouseMissionTab Submit Error]', err);
      setSubmitFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error inesperado.',
      });
      triggerToast('Error inesperado al guardar conteo.', 'amber');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto relative">
      {/* TOAST BANNER FLOTANTE ÁMBAR / NO BLOQUEANTE */}
      {floatingToast.show && (
        <div className="fixed top-20 right-6 z-50 animate-bounce duration-300">
          <div
            className={`px-4 py-3 rounded-2xl shadow-2xl border flex items-center space-x-3 text-xs font-semibold backdrop-blur ${
              floatingToast.type === 'amber'
                ? 'bg-[#FEF3C7] border-[#D97706] text-[#D97706]'
                : 'bg-emerald-50 border-[#009045] text-[#009045]'
            }`}
          >
            {floatingToast.type === 'amber' ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-[#D97706]" />
            ) : (
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#009045]" />
            )}
            <span>{floatingToast.text}</span>
            <button
              onClick={() => setFloatingToast((p) => ({ ...p, show: false }))}
              className="p-1 text-gray-500 hover:text-gray-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 1. SECCIÓN DE MÉTRICAS Y PANEL DE MISIÓN */}
      <MissionDashboardTab />

      {/* 2. BARRA DE ENTRADA CON NORMALIZACIÓN A 6 DÍGITOS LPAD */}
      {activeMission && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
            <div className="flex items-center space-x-2">
              <span className="p-2 bg-blue-50 text-[#263988] rounded-xl">
                <Barcode className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                  Terminal de Escaneo Rápido de SKU / Código de Barras
                </h3>
                <p className="text-xs text-gray-500">
                  Normalización automática de 1 a 5 dígitos con ceros a la izquierda (LPAD 6 dígitos)
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 text-[11px] font-mono font-bold bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/40 rounded-lg">
              Regla: ^\d&#123;1,5&#125;$ ➔ .padStart(6, '0')
            </span>
          </div>

          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-gray-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => handleSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Escanea con el lector o digita código (ej: 42 ➔ busca 000042)..."
              className="w-full bg-[#F3F4F6] border-2 border-gray-300 focus:border-[#263988] rounded-xl pl-11 pr-10 py-3 text-base sm:text-lg font-mono font-bold text-gray-900 placeholder-gray-500 focus:outline-none transition"
            />
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  clearActiveTask();
                  searchInputRef.current?.focus();
                }}
                className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-700"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 3. CARD DE PRODUCTO ACTIVO + FORMULARIO DE CONTEO */}
      {activeMission && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Card de Producto Activo */}
          <div className="lg:col-span-5 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-gray-100 mb-4">
                <div className="flex items-center space-x-2">
                  <Package className="w-5 h-5 text-[#263988]" />
                  <h4 className="text-sm font-black text-gray-900 uppercase tracking-wider">
                    Card de Producto Activo
                  </h4>
                </div>
                {activeTask && (
                  <span
                    className={`px-2.5 py-0.5 text-[10px] font-extrabold rounded-full uppercase tracking-wider font-mono ${
                      activeTask.Status === 'COMPLETED'
                        ? 'bg-emerald-100 text-[#009045] border border-emerald-300'
                        : activeTask.Status === 'DISCREPANT'
                        ? 'bg-red-100 text-red-700 border border-red-300'
                        : 'bg-gray-100 text-gray-700 border border-gray-300'
                    }`}
                  >
                    {activeTask.Status}
                  </span>
                )}
              </div>

              {activeTask ? (
                <div className="space-y-4">
                  {/* SKU & Descripción */}
                  <div>
                    <span className="text-[10px] text-gray-500 uppercase font-mono font-bold">
                      Código SKU
                    </span>
                    <div className="text-2xl font-black text-[#263988] font-mono tracking-wide">
                      {activeTask.SkuCode}
                    </div>
                    <p className="text-sm text-gray-800 font-semibold mt-1 leading-snug">
                      {activeTask.SkuDescription}
                    </p>
                  </div>

                  {/* Códigos de barra */}
                  <div className="bg-[#F3F4F6] p-3 rounded-xl border border-gray-200">
                    <span className="text-[10px] text-gray-500 uppercase font-mono font-bold block mb-1">
                      Códigos de Barra ({activeTask.Barcodes?.length || 0})
                    </span>
                    {activeTask.Barcodes && activeTask.Barcodes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {activeTask.Barcodes.map((bc, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-white border border-gray-300 text-gray-800 text-xs font-mono font-bold rounded"
                          >
                            {bc}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Sin códigos de barra mapeados</span>
                    )}
                  </div>

                  {/* Stock Sistema y Costo */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#F3F4F6] p-3 rounded-xl border border-gray-200">
                      <span className="text-[10px] text-gray-500 uppercase font-bold block">
                        Stock Sistema
                      </span>
                      <span className="text-2xl font-black text-gray-900 font-mono">
                        {activeTask.SystemQuantity}
                      </span>
                      <span className="text-[10px] text-gray-400 block">Teórico esperado</span>
                    </div>

                    <div className="bg-[#F3F4F6] p-3 rounded-xl border border-gray-200">
                      <span className="text-[10px] text-gray-500 uppercase font-bold block">
                        Costo Unitario
                      </span>
                      <span className="text-2xl font-black text-gray-900 font-mono">
                        ${activeTask.Cost.toFixed(2)}
                      </span>
                      <span className="text-[10px] text-gray-400 block">Valor inventario</span>
                    </div>
                  </div>

                  {/* Conteo previo */}
                  <div className="text-[11px] text-gray-600 font-mono pt-2 border-t border-gray-100 flex justify-between">
                    <span>
                      Conteo guardado:{' '}
                      <strong className="text-gray-900">
                        {activeTask.CountedQuantity !== null ? activeTask.CountedQuantity : 'Pendiente'}
                      </strong>
                    </span>
                    <span>
                      Discrepancia:{' '}
                      <strong className={activeTask.Discrepancy === 0 ? 'text-[#009045]' : 'text-red-600'}>
                        {activeTask.Discrepancy}
                      </strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-gray-400 flex flex-col items-center justify-center space-y-2">
                  <Barcode className="w-12 h-12 text-gray-300" />
                  <p className="text-xs">
                    Escanea o digita el código SKU para desplegar el Card de Producto Activo.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Formulario de Conteo y Teclado Numérico */}
          <div className="lg:col-span-7 bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
            <form onSubmit={handleSubmitCount} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Cantidad Física Contada */}
                <div
                  onClick={() => {
                    setActiveInputFocus('counted');
                    countedInputRef.current?.focus();
                  }}
                  className={`p-3.5 rounded-xl border-2 transition cursor-pointer ${
                    activeInputFocus === 'counted'
                      ? 'border-[#009045] bg-emerald-50/40'
                      : 'border-gray-200 bg-[#F3F4F6]'
                  }`}
                >
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
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
                    className="w-full bg-transparent text-3xl font-black text-gray-900 font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-500 font-mono block mt-1">
                    Existencia física en anaquel
                  </span>
                </div>

                {/* Ventas Durante Auditoría */}
                <div
                  onClick={() => setActiveInputFocus('sales')}
                  className={`p-3.5 rounded-xl border-2 transition cursor-pointer ${
                    activeInputFocus === 'sales'
                      ? 'border-[#009045] bg-emerald-50/40'
                      : 'border-gray-200 bg-[#F3F4F6]'
                  }`}
                >
                  <label className="block text-xs font-bold uppercase text-gray-700 mb-1">
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
                    className="w-full bg-transparent text-3xl font-black text-[#D97706] font-mono focus:outline-none"
                  />
                  <span className="text-[10px] text-gray-500 font-mono block mt-1">
                    Salidas en caja de auditoría
                  </span>
                </div>
              </div>

              {/* Cálculo Discrepancia Inmediata */}
              <div className="bg-[#F3F4F6] border border-gray-200 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-xs text-gray-700 uppercase font-bold block">
                    Discrepancia Resultante
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    (Contado + Ventas) - Sistema
                  </span>
                </div>

                <div>
                  {currentDiscrepancy !== null ? (
                    <div className="flex items-center space-x-2">
                      {currentDiscrepancy === 0 ? (
                        <span className="px-3 py-1 bg-emerald-100 text-[#009045] border border-emerald-300 rounded-lg text-lg font-black font-mono">
                          0 (Exacto)
                        </span>
                      ) : currentDiscrepancy < 0 ? (
                        <span className="px-3 py-1 bg-red-100 text-red-700 border border-red-300 rounded-lg text-lg font-black font-mono">
                          {currentDiscrepancy} (Faltante)
                        </span>
                      ) : (
                        <span className="px-3 py-1 bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/40 rounded-lg text-lg font-black font-mono">
                          +{currentDiscrepancy} (Sobrante)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400 font-mono">Ingresa cantidad física</span>
                  )}
                </div>
              </div>

              {/* Teclado Numérico */}
              <div className="bg-[#F3F4F6] p-3 rounded-xl border border-gray-200">
                <div className="text-[10px] text-gray-500 uppercase font-mono mb-2 flex justify-between">
                  <span>Teclado Numérico Rápido</span>
                  <span className="text-[#263988] font-bold">
                    Modo: {activeInputFocus === 'counted' ? 'Cantidad Contada' : 'Ventas'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {['7', '8', '9', 'BACK', '4', '5', '6', 'CLEAR', '1', '2', '3', '0'].map((btn) => (
                    <button
                      key={btn}
                      type="button"
                      disabled={!activeTask}
                      onClick={() => handleKeypadPress(btn)}
                      className={`py-2.5 rounded-lg font-mono font-bold text-sm transition select-none disabled:opacity-30 ${
                        btn === 'BACK'
                          ? 'bg-red-50 border border-red-200 text-red-700 hover:bg-red-100'
                          : btn === 'CLEAR'
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-white border border-gray-300 text-gray-900 hover:border-[#263988] active:scale-95 shadow-sm'
                      }`}
                    >
                      {btn === 'BACK' ? '⌫ Borrar' : btn === 'CLEAR' ? 'Limpiar' : btn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Botón de Confirmación Verde CTA #009045 */}
              <button
                type="submit"
                disabled={!activeTask || parsedCounted === null || isSubmitting}
                className="w-full py-3.5 bg-[#009045] hover:bg-[#007a3a] text-white font-black text-sm uppercase tracking-wider rounded-xl shadow-lg shadow-[#009045]/25 transition flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-98 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Guardando Conteo...</span>
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
      )}
    </div>
  );
};
