import React, { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  FileDown,
  RefreshCw,
  CheckCircle2,
  Clock,
  Layers,
  Building2,
  TrendingDown,
  TrendingUp,
  PackageCheck,
  Check,
  ShieldCheck,
  Sparkles,
  Download,
  AlertCircle,
  FileText,
  Search,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { useMissionStore } from '../../store/useMissionStore';
import { FloorDiscrepancy, VirtualTransfer, SUPABASE_TABLES } from '../../types/audit';

export const ReconciliationAndReportsTab: React.FC = () => {
  const {
    activeMission,
    floorDiscrepancies,
    virtualTransfers,
    isOnline,
    loadMissionData,
  } = useMissionStore();

  // Estados de entrada para conteos de piso (por DiscrepancyId)
  const [floorCountInputs, setFloorCountInputs] = useState<Record<string, string>>({});
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconcileFeedback, setReconcileFeedback] = useState<{
    id: string;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Estados para descarga de reporte PDF
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccess, setPdfSuccess] = useState<string | null>(null);

  // Filtros de búsqueda
  const [discSearchFilter, setDiscSearchFilter] = useState('');
  const [transferSearchFilter, setTransferSearchFilter] = useState('');

  // Sincronizar inputs locales con valores de piso existentes
  useEffect(() => {
    if (floorDiscrepancies && floorDiscrepancies.length > 0) {
      const initialMap: Record<string, string> = {};
      floorDiscrepancies.forEach((d) => {
        initialMap[d.DiscrepancyId] =
          d.FloorCountedQuantity !== null ? String(d.FloorCountedQuantity) : '';
      });
      setFloorCountInputs(initialMap);
    }
  }, [floorDiscrepancies]);

  // Manejar cambio en input de conteo de piso
  const handleFloorInputChange = (discrepancyId: string, val: string) => {
    setFloorCountInputs((prev) => ({
      ...prev,
      [discrepancyId]: val,
    }));
  };

  /**
   * 1. Botón "Reconciliar Piso":
   * Invoca la Edge Function `register-floor-count` pasando:
   * mission_id, discrepancy_id, sku_code, floor_counted_quantity.
   */
  const handleReconcileFloor = async (disc: FloorDiscrepancy) => {
    const rawVal = floorCountInputs[disc.DiscrepancyId];
    if (rawVal === undefined || rawVal === '' || isNaN(Number(rawVal))) {
      setReconcileFeedback({
        id: disc.DiscrepancyId,
        type: 'error',
        message: 'Por favor ingresa una cantidad física contada válida para el piso de venta.',
      });
      return;
    }

    const countedQty = Number(rawVal);
    setReconcilingId(disc.DiscrepancyId);
    setReconcileFeedback(null);

    try {
      // Invocación a Supabase Edge Function con payload exacto
      const { data, error } = await supabase.functions.invoke('register-floor-count', {
        body: {
          mission_id: disc.MissionId,
          discrepancy_id: disc.DiscrepancyId,
          sku_code: disc.SkuCode,
          floor_counted_quantity: countedQty,
          // Compatibilidad dual snake_case / camelCase
          missionId: disc.MissionId,
          discrepancyId: disc.DiscrepancyId,
          skuCode: disc.SkuCode,
          floorCountedQuantity: countedQty,
        },
      });

      if (error) {
        throw new Error(error.message || 'Error en Edge Function register-floor-count');
      }

      setReconcileFeedback({
        id: disc.DiscrepancyId,
        type: 'success',
        message: `¡Piso reconciliado exitosamente! SKU ${disc.SkuCode} actualizado.`,
      });

      // Recargar datos desde PostgreSQL Read Models
      if (activeMission) {
        await loadMissionData(activeMission.MissionId);
      }
    } catch (err) {
      console.error('[Reconcile Floor Exception]', err);
      setReconcileFeedback({
        id: disc.DiscrepancyId,
        type: 'error',
        message: err instanceof Error ? err.message : 'Error inesperado al reconciliar piso.',
      });
    } finally {
      setReconcilingId(null);
    }
  };

  /**
   * 3. Módulo de Generación y Descarga de Reporte PDF Oficial:
   * Ejecuta petición HTTP GET con token Bearer a la Edge Function `reports-pdf?mission_id=UUID`.
   * Procesa la respuesta binaria (`application/pdf`) y descarga como `AUDITORIAPLUS_Reporte_[MissionId].pdf`.
   */
  const handleDownloadPdfReport = async () => {
    if (!activeMission) return;

    setIsGeneratingPdf(true);
    setPdfError(null);
    setPdfSuccess(null);

    try {
      // Obtener sesión activa de Supabase o la anon key para el header Bearer
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token || SUPABASE_ANON_KEY;

      const functionUrl = `${SUPABASE_URL}/functions/v1/reports-pdf?mission_id=${encodeURIComponent(
        activeMission.MissionId
      )}`;

      const response = await fetch(functionUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${authToken}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Fallo al generar PDF (HTTP ${response.status}): ${errorText || response.statusText}`
        );
      }

      // Procesar respuesta binaria como Blob PDF
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      );

      // Desencadenar la descarga directa en el navegador
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `AUDITORIAPLUS_Reporte_${activeMission.MissionId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setPdfSuccess(`Reporte AUDITORIAPLUS_Reporte_${activeMission.MissionId}.pdf descargado con éxito.`);
    } catch (err) {
      console.error('[Download PDF Exception]', err);
      setPdfError(
        err instanceof Error
          ? err.message
          : 'Error al comunicarse con la Edge Function reports-pdf.'
      );
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Filtrado de discrepancias
  const filteredDiscrepancies = floorDiscrepancies.filter(
    (d) =>
      d.SkuCode.toLowerCase().includes(discSearchFilter.toLowerCase()) ||
      d.SkuDescription.toLowerCase().includes(discSearchFilter.toLowerCase())
  );

  // Filtrado de transferencias
  const filteredTransfers = virtualTransfers.filter(
    (t) =>
      t.SkuCode.toLowerCase().includes(transferSearchFilter.toLowerCase()) ||
      t.SkuDescription.toLowerCase().includes(transferSearchFilter.toLowerCase()) ||
      t.TransferId.toLowerCase().includes(transferSearchFilter.toLowerCase())
  );

  if (!activeMission) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center max-w-xl mx-auto shadow-xl">
        <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-white mb-1">Sin Misión Activa</h2>
        <p className="text-xs text-slate-400">
          Selecciona una misión en el <strong>"Tab 1: Dashboard &amp; Ingesta"</strong> para gestionar la conciliación de discrepancias y generar reportes oficiales.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 3. Banner Superior Destacado: Módulo de Reporte PDF Oficial */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-teal-950/40 border border-teal-500/40 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-teal-500/10 border border-teal-500/30 rounded-xl text-teal-400 shrink-0">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-black text-white">Reporte Oficial de Auditoría</h2>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full font-mono">
                Edge Function Stream
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Genera y descarga el documento oficial en formato PDF con la reconciliación completa de la misión{' '}
              <strong className="text-white">"{activeMission.Name}"</strong>, el cálculo consolidado de discrepancias, faltantes/sobrantes y valorizaciones de inventario.
            </p>
            {pdfSuccess && (
              <p className="text-xs text-emerald-400 font-mono mt-1.5 flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>{pdfSuccess}</span>
              </p>
            )}
            {pdfError && (
              <p className="text-xs text-red-400 font-mono mt-1.5 flex items-center space-x-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{pdfError}</span>
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleDownloadPdfReport}
          disabled={isGeneratingPdf}
          className="px-5 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-teal-500/25 transition flex items-center space-x-2 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed active:scale-98"
        >
          {isGeneratingPdf ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
              <span>Generando PDF...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4 stroke-[2.5]" />
              <span>Descargar Reporte General PDF</span>
            </>
          )}
        </button>
      </div>

      {/* 1. Tabla de Discrepancias en Piso de Venta (Depósito 150103) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              <h3 className="text-base font-bold text-white">
                Discrepancias en Piso de Venta (Depósito 150103)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Productos con discrepancias en almacén de origen que requieren doble conteo de comprobación en piso de venta.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={discSearchFilter}
                onChange={(e) => setDiscSearchFilter(e.target.value)}
                placeholder="Filtrar por SKU o nombre..."
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg pl-9 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono w-56"
              />
            </div>
            <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2.5 py-1 rounded-lg">
              {floorDiscrepancies.length} discrepancia{floorDiscrepancies.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {filteredDiscrepancies.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500/40" />
            <p className="text-sm font-semibold text-slate-400">
              {discSearchFilter
                ? 'No hay discrepancias que coincidan con el filtro.'
                : 'No existen discrepancias de almacén pendientes de verificación en piso.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/50">
                  <th className="py-3 px-3">SKU / Descripción</th>
                  <th className="py-3 px-3">Ruta de Depósitos</th>
                  <th className="py-3 px-3 text-right">Discrepancia Almacén</th>
                  <th className="py-3 px-3 text-right">Teórico Piso (150103)</th>
                  <th className="py-3 px-3 text-center">Físico Piso</th>
                  <th className="py-3 px-3 text-right">Discrepancia Piso</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-3 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredDiscrepancies.map((disc) => {
                  const inputValue = floorCountInputs[disc.DiscrepancyId] ?? '';
                  const parsedInput = inputValue === '' ? null : Number(inputValue);
                  const isResolved = disc.Status === 'RESOLVED';
                  const isProcessing = reconcilingId === disc.DiscrepancyId;
                  const currentFeedback =
                    reconcileFeedback?.id === disc.DiscrepancyId ? reconcileFeedback : null;

                  return (
                    <tr
                      key={disc.DiscrepancyId}
                      className="hover:bg-slate-800/40 transition"
                    >
                      <td className="py-3 px-3">
                        <div className="font-bold text-white font-mono">{disc.SkuCode}</div>
                        <div className="text-slate-400 text-[11px] truncate max-w-xs">
                          {disc.SkuDescription}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-300">
                        <span className="text-slate-400">{disc.OriginDeposit}</span>{' '}
                        <span className="text-teal-400">➔</span>{' '}
                        <span className="text-amber-300 font-semibold">{disc.FloorDeposit}</span>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-red-400">
                        {disc.WarehouseDiscrepancy > 0
                          ? `+${disc.WarehouseDiscrepancy}`
                          : disc.WarehouseDiscrepancy}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-slate-300 font-semibold">
                        {disc.FloorSystemQuantity}
                      </td>

                      {/* Input de captura física en piso */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            disabled={isResolved || isProcessing}
                            value={inputValue}
                            onChange={(e) =>
                              handleFloorInputChange(disc.DiscrepancyId, e.target.value)
                            }
                            placeholder="0"
                            className="w-20 bg-slate-950 border border-slate-700 focus:border-teal-400 rounded-lg px-2.5 py-1 text-center font-mono font-bold text-sm text-white focus:outline-none disabled:opacity-50"
                          />
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {disc.FloorDiscrepancy !== null ? (
                          <span
                            className={
                              disc.FloorDiscrepancy === 0
                                ? 'text-emerald-400'
                                : disc.FloorDiscrepancy < 0
                                ? 'text-red-400'
                                : 'text-amber-400'
                            }
                          >
                            {disc.FloorDiscrepancy > 0
                              ? `+${disc.FloorDiscrepancy}`
                              : disc.FloorDiscrepancy}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono tracking-wider ${
                            isResolved
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {disc.Status}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            onClick={() => handleReconcileFloor(disc)}
                            disabled={isProcessing || isResolved || inputValue === ''}
                            className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-teal-500 hover:from-amber-400 hover:to-teal-400 text-slate-950 font-bold text-[11px] rounded-lg shadow transition flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isProcessing ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>{isResolved ? 'Reconciliado' : 'Reconciliar Piso'}</span>
                          </button>

                          {currentFeedback && (
                            <span
                              className={`text-[10px] font-mono leading-tight max-w-[140px] text-center ${
                                currentFeedback.type === 'success'
                                  ? 'text-emerald-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {currentFeedback.message}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 2. Visualización de Traslados Virtuales Sugeridos (Depósito Tránsito 150104) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <ArrowRightLeft className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">
                Traslados Virtuales Sugeridos (Depósito Tránsito 150104)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Recomendaciones automáticas de compensación para subsanar faltantes de almacén moviendo mercancía desde 150103 (Piso) hacia 150104 (Tránsito).
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={transferSearchFilter}
                onChange={(e) => setTransferSearchFilter(e.target.value)}
                placeholder="Filtrar por SKU o ID..."
                className="bg-slate-950 border border-slate-700 text-xs rounded-lg pl-9 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono w-56"
              />
            </div>
            <span className="text-xs font-mono text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-2.5 py-1 rounded-lg">
              {virtualTransfers.length} traslado{virtualTransfers.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {filteredTransfers.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
            <ArrowRightLeft className="w-10 h-10 text-slate-700" />
            <p className="text-sm font-semibold text-slate-400">
              {transferSearchFilter
                ? 'No hay transferencias que coincidan con el filtro.'
                : 'No existen traslados virtuales sugeridos para esta misión.'}
            </p>
            <p className="text-[11px] text-slate-600">
              Los traslados virtuales se generarán automáticamente a medida que se completen las discrepancias cruzadas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase bg-slate-950/50">
                  <th className="py-3 px-3">Transfer ID</th>
                  <th className="py-3 px-3">SKU / Descripción</th>
                  <th className="py-3 px-3">Depósito Origen</th>
                  <th className="py-3 px-3">Depósito Destino</th>
                  <th className="py-3 px-3 text-right">Cantidad a Trasladar</th>
                  <th className="py-3 px-3">Depósito Tránsito</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                  <th className="py-3 px-3 text-right">Fecha Generación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredTransfers.map((tr) => (
                  <tr key={tr.TransferId} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-3 font-mono text-slate-400 text-[11px]">
                      {tr.TransferId.substring(0, 8)}...
                    </td>

                    <td className="py-3 px-3">
                      <div className="font-bold text-white font-mono">{tr.SkuCode}</div>
                      <div className="text-slate-400 text-[11px] truncate max-w-xs">
                        {tr.SkuDescription}
                      </div>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300">
                      <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-amber-300 font-semibold">
                        {tr.FromDeposit}
                      </span>
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300">
                      <span className="px-2 py-0.5 bg-slate-950 border border-slate-800 rounded text-teal-300 font-semibold">
                        {tr.ToDeposit}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono font-black text-cyan-400 text-sm">
                      {tr.TransferQuantity}
                    </td>

                    <td className="py-3 px-3 font-mono text-slate-300">
                      <span className="px-2 py-0.5 bg-cyan-950/60 border border-cyan-800/60 rounded text-cyan-300 font-semibold">
                        {tr.TransitDeposit || '150104'}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase font-mono tracking-wider ${
                          tr.Status === 'EXECUTED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                        }`}
                      >
                        {tr.Status}
                      </span>
                    </td>

                    <td className="py-3 px-3 text-right font-mono text-slate-400 text-[11px]">
                      {new Date(tr.CreatedAt).toLocaleDateString()} {new Date(tr.CreatedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
