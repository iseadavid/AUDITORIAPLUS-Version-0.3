import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  RefreshCw,
  Search,
  Building2,
  Check,
  PackageCheck,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMissionStore } from '../../store/useMissionStore';
import { useDiscrepancyStore } from '../../store/useDiscrepancyStore';
import { FloorDiscrepancy } from '../../types/audit';

export const DiscrepanciesTab: React.FC = () => {
  const { activeMission, floorDiscrepancies, virtualTransfers, loadMissionData } =
    useMissionStore();

  // useDiscrepancyStore
  const {
    pendingFloorDiscrepancies,
    setPendingDiscrepancies,
    resolveDiscrepancyLocally,
  } = useDiscrepancyStore();

  // Sincronizar discrepancias con useDiscrepancyStore
  useEffect(() => {
    if (floorDiscrepancies) {
      setPendingDiscrepancies(floorDiscrepancies);
    }
  }, [floorDiscrepancies, setPendingDiscrepancies]);

  // Estados locales para Modal de Conteo en Piso
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<FloorDiscrepancy | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [floorCountInput, setFloorCountInput] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitFeedback, setSubmitFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');

  // Abrir Modal de Conteo en Piso
  const handleOpenCountModal = (disc: FloorDiscrepancy) => {
    setSelectedDiscrepancy(disc);
    setFloorCountInput(
      disc.FloorCountedQuantity !== null ? String(disc.FloorCountedQuantity) : ''
    );
    setSubmitFeedback(null);
    setModalOpen(true);
  };

  // Reconciliar Piso desde el Modal
  const handleSaveFloorCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDiscrepancy || floorCountInput === '' || isNaN(Number(floorCountInput))) {
      setSubmitFeedback({
        type: 'error',
        message: 'Por favor ingresa una cantidad contada física válida.',
      });
      return;
    }

    const countedQty = Number(floorCountInput);
    setIsSubmitting(true);
    setSubmitFeedback(null);

    try {
      // 1. Invocar Edge Function de Supabase
      const { data, error } = await supabase.functions.invoke('register-floor-count', {
        body: {
          mission_id: selectedDiscrepancy.MissionId,
          discrepancy_id: selectedDiscrepancy.DiscrepancyId,
          sku_code: selectedDiscrepancy.SkuCode,
          floor_counted_quantity: countedQty,
          // Propiedades para compatibilidad
          missionId: selectedDiscrepancy.MissionId,
          discrepancyId: selectedDiscrepancy.DiscrepancyId,
          skuCode: selectedDiscrepancy.SkuCode,
          floorCountedQuantity: countedQty,
        },
      });

      if (error) {
        throw new Error(error.message || 'Error en Edge Function register-floor-count');
      }

      // 2. Actualizar estado en useDiscrepancyStore
      resolveDiscrepancyLocally(selectedDiscrepancy.DiscrepancyId, countedQty);

      setSubmitFeedback({
        type: 'success',
        message: `¡Piso reconciliado exitosamente! SKU ${selectedDiscrepancy.SkuCode} actualizado.`,
      });

      // Recargar datos en caliente
      if (activeMission) {
        await loadMissionData(activeMission.MissionId);
      }

      setTimeout(() => {
        setModalOpen(false);
        setSelectedDiscrepancy(null);
        setSubmitFeedback(null);
      }, 1200);
    } catch (err) {
      console.error('[Floor Reconcile Error]', err);
      setSubmitFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Error inesperado al reconciliar piso.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Lista de discrepancias (usa las de useDiscrepancyStore o fallback de store global)
  const displayList =
    pendingFloorDiscrepancies.length > 0 ? pendingFloorDiscrepancies : floorDiscrepancies;

  const filteredDiscrepancies = displayList.filter(
    (d) =>
      d.SkuCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.SkuDescription.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!activeMission) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center max-w-xl mx-auto shadow-sm">
        <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h2 className="text-base font-bold text-gray-900 mb-1">Sin Misión Activa</h2>
        <p className="text-xs text-gray-500">
          Selecciona una misión en el <strong>Tab 1: Misión Almacén</strong> para visualizar y auditar las discrepancias de piso de venta.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Cabecera del Tab 2: Discrepancias / Piso */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-[#D97706]" />
            <h2 className="text-lg font-black text-gray-900">
              Tab 2: Discrepancias / Piso de Venta (150103)
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Revisión y doble conteo de comprobación en anaqueles de retail para ítems con faltantes o sobrantes en almacén.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar SKU o nombre..."
              className="bg-[#F3F4F6] border border-gray-300 text-xs rounded-lg pl-9 pr-3 py-1.5 text-gray-900 placeholder-gray-500 focus:outline-none focus:border-[#263988] font-mono w-60"
            />
          </div>
          <span className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/40">
            {displayList.length} pendiente{displayList.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* Tabla de Discrepancias */}
      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        {filteredDiscrepancies.length === 0 ? (
          <div className="py-14 text-center text-gray-500 flex flex-col items-center justify-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-[#009045]/60" />
            <p className="text-sm font-bold text-gray-800">
              {searchTerm
                ? 'No se encontraron coincidencias para la búsqueda.'
                : '¡Excelente! No hay discrepancias pendientes de verificar en piso.'}
            </p>
            <p className="text-xs text-gray-500">
              Todos los faltantes de almacén están conciliados o no requieren ajuste en retail.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600 font-mono uppercase bg-[#F3F4F6]">
                  <th className="py-3 px-4">SKU / Descripción</th>
                  <th className="py-3 px-3">Ruta</th>
                  <th className="py-3 px-3 text-right">Discrep. Almacén</th>
                  <th className="py-3 px-3 text-right">Teórico Piso</th>
                  <th className="py-3 px-3 text-right">Físico Piso</th>
                  <th className="py-3 px-3 text-right">Discrep. Piso</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-4 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-sans">
                {filteredDiscrepancies.map((disc) => {
                  const isResolved = disc.Status === 'RESOLVED';
                  return (
                    <tr key={disc.DiscrepancyId} className="hover:bg-gray-50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-gray-900 font-mono text-sm">{disc.SkuCode}</div>
                        <div className="text-gray-500 text-[11px] truncate max-w-xs">
                          {disc.SkuDescription}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 font-mono text-gray-600">
                        <span>{disc.OriginDeposit}</span>
                        <span className="text-gray-400 mx-1">➔</span>
                        <span className="font-bold text-[#263988]">{disc.FloorDeposit}</span>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-red-600">
                        {disc.WarehouseDiscrepancy > 0
                          ? `+${disc.WarehouseDiscrepancy}`
                          : disc.WarehouseDiscrepancy}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-gray-700 font-semibold">
                        {disc.FloorSystemQuantity}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold text-gray-900">
                        {disc.FloorCountedQuantity !== null ? disc.FloorCountedQuantity : '-'}
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono font-bold">
                        {disc.FloorDiscrepancy !== null ? (
                          <span
                            className={
                              disc.FloorDiscrepancy === 0
                                ? 'text-[#009045]'
                                : disc.FloorDiscrepancy < 0
                                ? 'text-red-600'
                                : 'text-[#D97706]'
                            }
                          >
                            {disc.FloorDiscrepancy > 0
                              ? `+${disc.FloorDiscrepancy}`
                              : disc.FloorDiscrepancy}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono tracking-wider ${
                            isResolved
                              ? 'bg-emerald-100 text-[#009045] border border-emerald-300'
                              : 'bg-[#FEF3C7] text-[#D97706] border border-[#D97706]/40'
                          }`}
                        >
                          {disc.Status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => handleOpenCountModal(disc)}
                          className="px-3.5 py-1.5 bg-[#009045] hover:bg-[#007a3a] text-white font-bold text-xs rounded-lg shadow-sm transition flex items-center justify-center space-x-1 mx-auto"
                        >
                          <PackageCheck className="w-3.5 h-3.5" />
                          <span>{isResolved ? 'Re-Verificar' : 'Contar en Piso'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Conteo en Piso de Venta */}
      {modalOpen && selectedDiscrepancy && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-4">
              <div className="flex items-center space-x-2">
                <span className="p-2 bg-[#FEF3C7] rounded-lg text-[#D97706]">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-gray-900">Modal de Conteo en Piso</h3>
                  <p className="text-xs text-gray-500">Depósito 150103 (Retail / Farmacia)</p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Ficha técnica rápida del producto en discrepancia */}
            <div className="bg-[#F3F4F6] p-3.5 rounded-xl border border-gray-200 space-y-2 mb-4 text-xs">
              <div className="flex justify-between items-center">
                <span className="font-mono font-bold text-gray-900 text-sm">
                  SKU: {selectedDiscrepancy.SkuCode}
                </span>
                <span className="text-red-600 font-bold font-mono">
                  Faltante Almacén: {selectedDiscrepancy.WarehouseDiscrepancy}
                </span>
              </div>
              <p className="text-gray-700 font-medium">{selectedDiscrepancy.SkuDescription}</p>
              <div className="pt-2 border-t border-gray-300 flex justify-between font-mono text-gray-600">
                <span>Stock Sistema en Piso: <strong>{selectedDiscrepancy.FloorSystemQuantity}</strong></span>
                <span>Dep: {selectedDiscrepancy.FloorDeposit}</span>
              </div>
            </div>

            {/* Formulario de Conteo */}
            <form onSubmit={handleSaveFloorCount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                  Cantidad Física Contada en Piso de Venta
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  autoFocus
                  value={floorCountInput}
                  onChange={(e) => setFloorCountInput(e.target.value)}
                  placeholder="Ej: 12"
                  className="w-full bg-[#F3F4F6] border-2 border-gray-300 focus:border-[#263988] rounded-xl px-4 py-2.5 text-xl font-bold font-mono text-gray-900 focus:outline-none"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Ingresa las unidades encontradas físicamente en los estantes del piso de venta.
                </p>
              </div>

              {submitFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs font-mono flex items-center space-x-2 ${
                    submitFeedback.type === 'success'
                      ? 'bg-emerald-50 border border-[#009045] text-[#009045]'
                      : 'bg-red-50 border border-red-300 text-red-700'
                  }`}
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{submitFeedback.message}</span>
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-[#009045] hover:bg-[#007a3a] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow transition flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Reconciliar Piso</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
