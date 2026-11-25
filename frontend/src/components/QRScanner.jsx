import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, QrCode, RefreshCw, Search, UserCheck } from "lucide-react";

const READER_ELEMENT_ID = "ojt-qr-reader";

export default function QRScanner({
  onLookupStudent,
  onShowQrBadge,
  students = [],
  isBusy = false,
}) {
  const scannerRef = useRef(null);
  const lastScanRef = useRef({ code: "", time: 0 });

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    let mounted = true;
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (!mounted) return;
        setCameras(devices || []);
        if (devices && devices.length > 0) {
          const backCamera = devices.find((d) =>
            /back|rear|environment/i.test(d.label || "")
          );
          setSelectedCameraId((backCamera || devices[0]).id);
        }
      })
      .catch(() => {
        // Camera list may require explicit permission first; handled on Start Camera
      });

    return () => {
      mounted = false;
      stopCamera();
    };
  }, []);

  async function stopCamera() {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch {
        // Ignore cleanup errors when unmounting
      }
      scannerRef.current = null;
    }
    setIsScanning(false);
  }

  async function startCamera() {
    setCameraError("");
    if (isScanning) return;

    try {
      const instance = new Html5Qrcode(READER_ELEMENT_ID);
      scannerRef.current = instance;

      const cameraConfig = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: "environment" };

      await instance.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 230, height: 230 },
          aspectRatio: 1.333,
        },
        async (decodedText) => {
          const now = Date.now();
          if (
            decodedText === lastScanRef.current.code &&
            now - lastScanRef.current.time < 3000
          ) {
            return;
          }
          lastScanRef.current = { code: decodedText, time: now };
          await stopCamera();
          onLookupStudent(decodedText);
        },
        () => {
          // Ignore per-frame decode misses
        }
      );

      setIsScanning(true);
    } catch (err) {
      setIsScanning(false);
      scannerRef.current = null;
      const msg = err?.message || String(err || "Unable to access camera.");
      setCameraError(
        `Camera unavailable (${msg}). Ensure camera permissions are granted or use HTTPS on remote hosts.`
      );
    }
  }

  function handleManualSubmit(e) {
    e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed || isBusy) return;
    onLookupStudent(trimmed);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              QR Code Scanner
            </h2>
            <p className="text-xs text-slate-500">
              Scan an OJT trainee QR badge to fetch details and trigger supervisor sign-off
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cameras.length > 1 && (
            <select
              value={selectedCameraId}
              onChange={(e) => setSelectedCameraId(e.target.value)}
              disabled={isScanning}
              aria-label="Select camera"
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-700 disabled:opacity-50"
            >
              {cameras.map((cam, idx) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || `Camera ${idx + 1}`}
                </option>
              ))}
            </select>
          )}

          {!isScanning ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={isBusy}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              Start Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={stopCamera}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition"
            >
              <CameraOff className="w-4 h-4" />
              Stop Camera
            </button>
          )}
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Camera Viewfinder */}
        <div className="lg:col-span-6">
          <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-950/95 overflow-hidden min-h-[250px] flex flex-col items-center justify-center">
            <div id={READER_ELEMENT_ID} className="w-full" />
            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
                <Camera className="w-10 h-10 text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-200">
                  Camera viewfinder is idle
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  Click &ldquo;Start Camera&rdquo; and point your webcam at an OJT student&rsquo;s QR code.
                </p>
              </div>
            )}
          </div>

          {cameraError && (
            <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              {cameraError}
            </div>
          )}
        </div>

        {/* Manual Lookup & Quick Directory */}
        <div className="lg:col-span-6 space-y-4">
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label
              htmlFor="manual-qr-input"
              className="block text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              Manual Student ID / QR Payload Lookup
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="manual-qr-input"
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="Enter ID (e.g. OJT-2026-001) or scanned QR JSON..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={!manualCode.trim() || isBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {isBusy ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <UserCheck className="w-4 h-4" />
                )}
                Verify
              </button>
            </div>
          </form>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your Trainee Profile
              </span>
              <span className="text-[11px] text-slate-400">Click to Clock In/Out or view QR</span>
            </div>

            {students.length === 0 ? (
              <p className="text-xs text-slate-500">
                Use the manual School ID input or camera scanner above to log attendance.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {students.map((s) => (
                  <div
                    key={s.id}
                    className="inline-flex items-stretch rounded-lg bg-white border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onLookupStudent(s.student_id)}
                      title="Click to Clock In / Clock Out"
                      className="text-left px-2.5 py-1.5 hover:bg-blue-50/60 transition text-xs disabled:opacity-50"
                    >
                      <div className="font-semibold text-slate-800">{s.full_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{s.student_id}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onShowQrBadge?.(s)}
                      title={`Show QR Code for ${s.student_id}`}
                      className="px-2 border-l border-slate-200 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 flex items-center justify-center transition"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
