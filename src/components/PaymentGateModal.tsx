"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type PaymentStep = "pay" | "proof";

interface PaymentGateModalProps {
  isOpen: boolean;
  step: PaymentStep;
  amountPhp: number;
  regularAmountPhp: number;
  promoTitle: string;
  promoEndAtIso: string;
  qrImagePath: string;
  proofFile: File | null;
  isSubmitting: boolean;
  onClose: () => void;
  onContinue: () => void;
  onProofFileChange: (file: File | null) => void;
  onSubmitProof: () => void;
}

export function PaymentGateModal({
  isOpen,
  step,
  amountPhp,
  regularAmountPhp,
  promoTitle,
  promoEndAtIso,
  qrImagePath,
  proofFile,
  isSubmitting,
  onClose,
  onContinue,
  onProofFileChange,
  onSubmitProof,
}: PaymentGateModalProps) {
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => {
    const promoEndTime = new Date(promoEndAtIso).getTime();
    if (!Number.isFinite(promoEndTime)) return;

    const updateRemaining = () => {
      setRemainingMs(Math.max(0, promoEndTime - Date.now()));
    };

    const timeoutId = window.setTimeout(updateRemaining, 0);
    const intervalId = window.setInterval(updateRemaining, 1000);
    return () => {
      window.clearTimeout(timeoutId);
      window.clearInterval(intervalId);
    };
  }, [promoEndAtIso]);

  const countdownLabel = useMemo(() => {
    if (remainingMs <= 0) return "Promo ending soon";

    const totalSeconds = Math.floor(remainingMs / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }, [remainingMs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12500] flex items-center justify-center bg-slate-900/55 p-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Strava Upload Payment</h3>
          <div className="mt-2 rounded-md border border-[#ff5b14]/30 bg-[#fff4ef] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#ff5b14]">{promoTitle}</p>
            <p className="mt-1 text-sm text-slate-700">
              <span className="mr-2 text-slate-400 line-through">PHP {regularAmountPhp}</span>
              <span className="text-base font-semibold text-[#ff5b14]">PHP {amountPhp}</span>
            </p>
            <p className="mt-1 text-xs text-slate-600">Promo countdown: {countdownLabel}</p>
          </div>
        </div>

        {step === "pay" ? (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-slate-700">
              Please pay the promo amount using GCash, then screenshot the successful payment receipt.
            </p>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="mx-auto flex max-w-[280px] items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-2">
                <Image
                  src={qrImagePath}
                  alt="GCash Number : 09629647418"
                  width={260}
                  height={260}
                  className="h-auto w-full object-contain"
                  unoptimized
                />
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                Transfer Fees may apply.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-slate-700">
              Upload your payment screenshot. Make sure the amount and recipient details are visible for faster verification.
            </p>
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              We will also request your device location on submit for fraud checks.
            </p>

            <input
              type="file"
              accept="image/*"
              onChange={(event) => onProofFileChange(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#ff5b14] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />

            {proofFile ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="truncate pr-3">{proofFile.name}</span>
                <button
                  type="button"
                  onClick={() => onProofFileChange(null)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>

          {step === "pay" ? (
            <button
              type="button"
              onClick={onContinue}
              className="rounded-md bg-[#ff5b14] px-4 py-2 text-sm font-semibold text-white"
            >
              I Paid
            </button>
          ) : (
            <button
              type="button"
              onClick={onSubmitProof}
              disabled={isSubmitting}
              className="rounded-md bg-[#ff5b14] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit Proof"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
