import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff, ImageUp, QrCode, RefreshCw, Search, UserCheck } from "lucide-react";

const READER_ELEMENT_ID = "ojt-qr-reader";
const SECURE_CONTEXT_MESSAGE =
  "Live camera scanning requires HTTPS on remote hosts (or http://localhost). Upload a QR image or enter the ID/payload below.";

function errorMessage(error) {
  return error?.message || String(error || "Unknown camera error");
}

async function cleanupScanner(scanner) {
  let cleanupError = null;
  try {
    if (scanner.isScanning) await scanner.stop();
  } catch (error) {
    cleanupError = error;
  }
  try {
    scanner.clear();
  } catch (error) {
    cleanupError ||= error;
  }
  return cleanupError;
}

export default function QRScanner({
  onLookupStudent,
  onShowQrBadge,
  students = [],
  isBusy = false,
}) {
  const scannerRef = useRef(null);
  const mountedRef = useRef(false);
  const lastScanRef = useRef({ code: "", time: 0 });
  const isSecureContext = typeof window !== "undefined" && window.isSecureContext;
  const supportsCamera =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
  const canUseCamera = isSecureContext && supportsCamera;

  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isScanningImage, setIsScanningImage] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [imageError, setImageError] = useState("");
  const [manualCode, setManualCode] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    if (!isSecureContext) {
      setCameraError(SECURE_CONTEXT_MESSAGE);
    } else if (!supportsCamera) {
      setCameraError("Live camera streaming is unavailable in this browser. Upload a QR image or enter the ID/payload below.");
    } else {
      Promise.resolve()
        .then(() => Html5Qrcode.getCameras())
        .then((devices) => {
          if (!mountedRef.current) return;
          setCameras(devices || []);
          if (devices?.length) {
            const backCamera = devices.find((device) =>
              /back|rear|environment/i.test(device.label || ""),
            );
            setSelectedCameraId((backCamera || devices[0]).id);
          }
        })
        .catch((error) => {
          if (mountedRef.current) {
            setCameraError(
              `Could not list cameras: ${errorMessage(error)}. Check browser permissions, or upload a QR image / enter the ID manually.`,
            );
          }
        });
    }

    return () => {
      mountedRef.current = false;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void cleanupScanner(scanner).then((error) => {
          if (error) console.error("Could not clean up the QR camera scanner", error);
        });
      }
    };
  }, [isSecureContext, supportsCamera]);

  async function stopCamera() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (mountedRef.current) {
      setIsScanning(false);
      setIsStarting(false);
    }
    if (!scanner) return;

    const cleanupError = await cleanupScanner(scanner);
    if (cleanupError && mountedRef.current) {
      setCameraError(`The camera could not be stopped cleanly: ${errorMessage(cleanupError)}`);
    }
  }

  async function startCamera() {
    if (isStarting || isScanning || isScanningImage || isBusy) return;
    if (!isSecureContext) {
      setCameraError(SECURE_CONTEXT_MESSAGE);
      return;
    }
    if (!supportsCamera) {
      setCameraError("Live camera streaming is unavailable in this browser. Upload a QR image or enter the ID/payload below.");
      return;
    }

    setCameraError("");
    setIsStarting(true);
    let instance;
    try {
      instance = new Html5Qrcode(READER_ELEMENT_ID);
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
        (decodedText) => {
          if (!mountedRef.current) return;
          const now = Date.now();
          if (
            decodedText === lastScanRef.current.code &&
            now - lastScanRef.current.time < 3000
          ) {
            return;
          }
          lastScanRef.current = { code: decodedText, time: now };
          void stopCamera()
            .then(() => onLookupStudent(decodedText))
            .catch((error) => {
              if (mountedRef.current) {
                setCameraError(`QR was read, but lookup failed: ${errorMessage(error)}`);
              }
            });
        },
        () => {},
      );

      if (mountedRef.current && scannerRef.current === instance) {
        setIsScanning(true);
      } else {
        const cleanupError = await cleanupScanner(instance);
        if (cleanupError) console.error("Could not clean up a QR scanner started during unmount", cleanupError);
      }
    } catch (error) {
      if (instance) {
        const cleanupError = await cleanupScanner(instance);
        if (cleanupError) console.error("Could not clean up a failed QR camera start", cleanupError);
        if (scannerRef.current === instance) scannerRef.current = null;
      }
      if (mountedRef.current) {
        setIsScanning(false);
        setCameraError(
          `Camera could not start: ${errorMessage(error)}. Check camera permissions, or upload a QR image / enter the ID manually.`,
        );
      }
    } finally {
      if (mountedRef.current) setIsStarting(false);
    }
  }

  async function handleImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || isBusy || isStarting || isScanning || isScanningImage) return;

    setImageError("");
    setIsScanningImage(true);
    let fileScanner;
    try {
      fileScanner = new Html5Qrcode(READER_ELEMENT_ID);
      const decodedText = await fileScanner.scanFile(file, false);
      if (mountedRef.current) {
        setManualCode(decodedText);
        try {
          await onLookupStudent(decodedText);
        } catch (error) {
          setImageError(`QR was read, but lookup failed: ${errorMessage(error)}`);
        }
      }
    } catch {
      if (mountedRef.current) {
        setImageError("No QR code could be read from this image. Try a clearer photo, or enter the ID/payload manually.");
      }
    } finally {
      if (fileScanner) {
        try {
          fileScanner.clear();
        } catch (error) {
          console.error("Could not clear the QR image scanner", error);
        }
      }
      if (mountedRef.current) setIsScanningImage(false);
    }
  }

  function handleManualSubmit(event) {
    event.preventDefault();
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
            <h2 className="text-base font-semibold text-slate-900">QR Code Scanner</h2>
            <p className="text-xs text-slate-500">
              Scan an OJT trainee QR badge to fetch details and trigger supervisor sign-off
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cameras.length > 1 && (
            <select
              value={selectedCameraId}
              onChange={(event) => setSelectedCameraId(event.target.value)}
              disabled={isScanning || isStarting}
              aria-label="Select camera"
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-700 disabled:opacity-50"
            >
              {cameras.map((camera, index) => (
                <option key={camera.id} value={camera.id}>
                  {camera.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          )}

          {!isScanning ? (
            <button
              type="button"
              onClick={startCamera}
              disabled={!canUseCamera || isBusy || isStarting || isScanningImage}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              {isStarting ? "Starting…" : "Start Camera"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { void stopCamera(); }}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition"
            >
              <CameraOff className="w-4 h-4" />
              Stop Camera
            </button>
          )}
        </div>
      </div>

      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-6">
          <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-950/95 overflow-hidden min-h-[250px] flex flex-col items-center justify-center">
            <div id={READER_ELEMENT_ID} className="w-full" />
            {!isScanning && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
                <Camera className="w-10 h-10 text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-200">
                  {isStarting ? "Starting camera…" : "Camera viewfinder is idle"}
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs">
                  {canUseCamera
                    ? "Click “Start Camera” and point your webcam at an OJT student’s QR code."
                    : "Use the photo upload or manual lookup to scan without live camera access."}
                </p>
              </div>
            )}
          </div>

          {cameraError && (
            <div role="status" className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              {cameraError}
            </div>
          )}
        </div>

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
                  onChange={(event) => setManualCode(event.target.value)}
                  placeholder="Enter ID (e.g. OJT-2026-001) or scanned QR JSON..."
                  className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={!manualCode.trim() || isBusy}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition disabled:opacity-50"
              >
                {isBusy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                Verify
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-slate-200 bg-blue-50/50 p-3.5">
            <label htmlFor="qr-image-input" className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              <ImageUp className="h-4 w-4 text-blue-600" />
              Scan QR from a photo
            </label>
            <input
              id="qr-image-input"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              disabled={isBusy || isStarting || isScanning || isScanningImage}
              className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:font-semibold file:text-blue-700 hover:file:bg-blue-50 disabled:opacity-50"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Upload a QR screenshot or photo; works even when live camera access is blocked.
            </p>
            {isScanningImage && <p role="status" className="mt-2 text-xs text-blue-700">Reading QR image…</p>}
            {imageError && <p role="alert" className="mt-2 text-xs text-rose-700">{imageError}</p>}
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Your Trainee Profile
              </span>
              <span className="text-[11px] text-slate-400">Click to Clock In/Out or view QR</span>
            </div>

            {students.length === 0 ? (
              <p className="text-xs text-slate-500">
                Use the manual School ID input or scanner above to log attendance.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {students.map((student) => (
                  <div
                    key={student.id}
                    className="inline-flex items-stretch rounded-lg bg-white border border-slate-200 overflow-hidden"
                  >
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onLookupStudent(student.student_id)}
                      title="Click to Clock In / Clock Out"
                      className="text-left px-2.5 py-1.5 hover:bg-blue-50/60 transition text-xs disabled:opacity-50"
                    >
                      <div className="font-semibold text-slate-800">{student.full_name}</div>
                      <div className="font-mono text-[11px] text-slate-500">{student.student_id}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onShowQrBadge?.(student)}
                      title={`Show QR Code for ${student.student_id}`}
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
