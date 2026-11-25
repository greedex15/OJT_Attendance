import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, QrCode, UserCheck, X } from "lucide-react";

export default function QRBadgeModal({
  isOpen,
  student,
  onClose,
  onTriggerLookup,
  allowClockAction = true,
}) {
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [qrValue, setQrValue] = useState("");

  useEffect(() => {
    if (!isOpen || !student) return;
    const value = student.qr_code_value || student.student_id || "";
    setQrValue(value);

    QRCode.toDataURL(value, {
      width: 320,
      margin: 2,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(""));
  }, [isOpen, student]);

  if (!isOpen || !student) return null;

  function handleDownload() {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `ojt-qr-${student.student_id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-sm w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <QrCode className="w-5 h-5 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">OJT QR Code Badge</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close QR badge"
            className="p-1 rounded-lg text-slate-500 hover:bg-slate-200/70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center space-y-4">
          <div className="p-3 rounded-2xl border-2 border-slate-200 bg-white shadow-sm">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR Code for ${student.student_id}`}
                className="w-56 h-56 object-contain"
              />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-xs text-slate-400">
                Generating QR...
              </div>
            )}
          </div>

          <div>
            <div className="text-lg font-bold text-slate-900">
              {student.full_name || student.student_id}
            </div>
            <div className="mt-1 inline-block font-mono text-xs font-semibold px-2.5 py-1 rounded bg-blue-50 text-blue-800 border border-blue-200">
              School ID: {qrValue}
            </div>
            {(student.course || student.department) && (
              <p className="text-xs text-slate-500 mt-1.5">
                {[student.course, student.department].filter(Boolean).join(" • ")}
              </p>
            )}
          </div>

          <div className={`w-full grid gap-2.5 pt-2 ${allowClockAction ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Download PNG
            </button>

            {allowClockAction && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTriggerLookup?.(qrValue);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
              >
                <UserCheck className="w-4 h-4" />
                Clock In / Out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
