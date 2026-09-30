import React, { useState } from 'react';
import {
  FileText,
  Download,
  RefreshCw,
  Check,
  AlertCircle,
  Building2,
  DollarSign,
  TrendingUp,
  Boxes,
  Layers,
  ArrowRightLeft,
  ShieldCheck,
} from 'lucide-react';
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/supabase';
import { useMissionStore } from '../../store/useMissionStore';

export const ReportsTab: React.FC = () => {
  const { activeMission, tasks, floorDiscrepancies, virtualTransfers } = useMissionStore();

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccess, setPdfSuccess] = useState<string | null>(null);

  // Cálculo de resumen financiero del valor auditado
  const totalSystemValue = tasks.reduce(
    (acc, t) => acc + (t.SystemQuantity || 0) * (t.Cost || 0),
    0
  );

  const totalPhysicalValue = tasks.reduce(
    (acc, t) =>
      acc + (t.CountedQuantity !== null ? t.CountedQuantity : t.SystemQuantity || 0) * (t.Cost || 0),
    0
  );

  const totalDiscrepancyValue = totalPhysicalValue - totalSystemValue;

  /**
   * Generación y Descarga de Reporte PDF Oficial:
   * GET /functions/v1/reports-pdf?mission_id=UUID con token Bearer
   */
  const handleDownloadPdfReport = async () => {
    if (!activeMission) return;

    setIsGeneratingPdf(true);
    setPdfError(null);
    setPdfSuccess(null);

    try {
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

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(
        new Blob([blob], { type: 'application/pdf' })
      );

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

  if (!activeMission) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-10 text-center max-w-xl mx-auto shadow-sm">
        <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <h2 className="text-base font-bold text-gray-900 mb-1">Sin Misión Activa</h2>
        <p className="text-xs text-gray-500">
          Selecciona una misión en el <strong>Tab 1: Misión Almacén</strong> para visualizar el balance financiero y descargar el reporte oficial.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Cabecera del Tab 3 */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FileText className="w-5 h-5 text-[#263988]" />
            <h2 className="text-lg font-black text-gray-900">
              Tab 3: PDF / Reportes Oficiales
            </h2>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Resumen de valorización financiera auditada, balances de existencias y generación de acta formal en PDF.
          </p>
        </div>

        <div className="px-3 py-1 rounded-lg text-xs font-mono font-bold bg-blue-50 text-[#263988] border border-blue-200">
          Misión: {activeMission.Name} (Dep. {activeMission.DepositCode})
        </div>
      </div>

      {/* Resumen Financiero de Valor Auditado */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Valor Teórico Sistema */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-xs text-gray-500 font-bold uppercase tracking-wider block mb-1">
            Valor Teórico del Sistema
          </span>
          <div className="text-2xl font-black text-gray-900 font-mono">
            ${totalSystemValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">
            Cálculo base: {tasks.length} SKUs teóricos
          </span>
        </div>

        {/* Valor Físico Auditado */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-xs text-[#009045] font-bold uppercase tracking-wider block mb-1">
            Valor Físico Auditado
          </span>
          <div className="text-2xl font-black text-[#009045] font-mono">
            ${totalPhysicalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">
            Conteo físico + ventas conciliadas
          </span>
        </div>

        {/* Impacto Financiero Neto */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider block mb-1 text-gray-700">
            Impacto Neto Discrepancias
          </span>
          <div
            className={`text-2xl font-black font-mono ${
              totalDiscrepancyValue === 0
                ? 'text-[#009045]'
                : totalDiscrepancyValue < 0
                ? 'text-red-600'
                : 'text-[#D97706]'
            }`}
          >
            {totalDiscrepancyValue >= 0 ? '+' : ''}$
            {totalDiscrepancyValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-gray-400 mt-1 block">
            {totalDiscrepancyValue === 0
              ? 'Inventario cuadrado al 100%'
              : totalDiscrepancyValue < 0
              ? 'Diferencia neta faltante'
              : 'Diferencia neta sobrante'}
          </span>
        </div>
      </div>

      {/* Tarjeta Gigante de Descarga de Reporte PDF Oficial con color Navy #263988 */}
      <div className="bg-white border-2 border-gray-200 rounded-3xl p-8 sm:p-10 shadow-md text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 text-[#263988] flex items-center justify-center mx-auto shadow-sm">
          <FileText className="w-9 h-9" />
        </div>

        <div className="max-w-xl mx-auto space-y-2">
          <h3 className="text-xl font-black text-gray-900">
            Acta de Auditoría y Certificación de Inventario
          </h3>
          <p className="text-xs sm:text-sm text-gray-600">
            Genera el documento oficial PDF emitido por Supabase Edge Function <code className="text-[#263988] font-mono">reports-pdf</code>, incluyendo el desglose de SKUs, discrepancias conciliadas en piso de venta y transferencias virtuales sugeridas.
          </p>
        </div>

        {/* Feedback de Descarga */}
        {pdfSuccess && (
          <div className="p-3 bg-emerald-50 border border-[#009045]/40 rounded-xl text-xs font-mono text-[#009045] max-w-md mx-auto flex items-center justify-center space-x-2">
            <Check className="w-4 h-4" />
            <span>{pdfSuccess}</span>
          </div>
        )}

        {pdfError && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-mono text-red-600 max-w-md mx-auto flex items-center justify-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>{pdfError}</span>
          </div>
        )}

        {/* BOTÓN GIGANTE COLOR NAVY #263988 */}
        <div className="pt-2">
          <button
            onClick={handleDownloadPdfReport}
            disabled={isGeneratingPdf}
            className="w-full sm:w-auto px-10 py-5 bg-[#263988] hover:bg-[#1e2d6b] text-white font-black text-sm sm:text-base uppercase tracking-wider rounded-2xl shadow-xl shadow-[#263988]/25 transition flex items-center justify-center space-x-3 mx-auto disabled:opacity-50 disabled:cursor-not-allowed active:scale-98 cursor-pointer"
          >
            {isGeneratingPdf ? (
              <>
                <RefreshCw className="w-6 h-6 animate-spin text-white" />
                <span>Generando Reporte Oficial...</span>
              </>
            ) : (
              <>
                <Download className="w-6 h-6 stroke-[2.5]" />
                <span>DESCARGAR REPORTE PDF OFICIAL AUDITORIAPLUS</span>
              </>
            )}
          </button>
        </div>

        {/* Métricas al pie */}
        <div className="pt-4 border-t border-gray-100 flex flex-wrap items-center justify-center gap-6 text-xs text-gray-500 font-mono">
          <span>Universo: <strong>{activeMission.TotalSkus} SKUs</strong></span>
          <span>•</span>
          <span>Contados: <strong className="text-[#009045]">{activeMission.CountedSkus}</strong></span>
          <span>•</span>
          <span>Discrepancias: <strong className="text-red-600">{activeMission.DiscrepantSkus}</strong></span>
          <span>•</span>
          <span>Traslados Virtuales: <strong className="text-[#263988]">{virtualTransfers.length}</strong></span>
        </div>
      </div>
    </div>
  );
};
