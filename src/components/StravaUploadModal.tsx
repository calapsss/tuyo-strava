"use client";

export interface StravaUploadDraft {
  name: string;
  description: string;
  privateNote: string;
  hideFromHome: boolean;
  trainer: boolean;
  commute: boolean;
}

interface StravaUploadModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  isConnected: boolean;
  draft: StravaUploadDraft;
  photo: File | null;
  onChange: (patch: Partial<StravaUploadDraft>) => void;
  onPhotoChange: (file: File | null) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function StravaUploadModal({
  isOpen,
  isSubmitting,
  isConnected,
  draft,
  photo,
  onChange,
  onPhotoChange,
  onClose,
  onSubmit,
}: StravaUploadModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-900/55 p-4">
      <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">Upload To Strava</h3>
          <p className="mt-1 text-sm text-slate-600">
            Set upload details before sending your activity.
          </p>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Title</label>
            <input
              type="text"
              value={draft.name}
              onChange={(event) => onChange({ name: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
              placeholder="Morning Run"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
            <textarea
              rows={3}
              value={draft.description}
              onChange={(event) => onChange({ description: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
              placeholder="Optional public activity description"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Private Notes</label>
            <textarea
              rows={3}
              value={draft.privateNote}
              onChange={(event) => onChange({ privateNote: event.target.value })}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-[#ff5b14] focus:ring"
              placeholder="Private note for yourself"
            />
            <p className="mt-1 text-xs text-slate-500">
              Stored locally in this browser and not sent to Strava via API.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Hide from Home
              <input
                type="checkbox"
                checked={draft.hideFromHome}
                onChange={(event) => onChange({ hideFromHome: event.target.checked })}
                className="h-4 w-4 accent-[#ff5b14]"
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Trainer
              <input
                type="checkbox"
                checked={draft.trainer}
                onChange={(event) => onChange({ trainer: event.target.checked })}
                className="h-4 w-4 accent-[#ff5b14]"
              />
            </label>

            <label className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Commute
              <input
                type="checkbox"
                checked={draft.commute}
                onChange={(event) => onChange({ commute: event.target.checked })}
                className="h-4 w-4 accent-[#ff5b14]"
              />
            </label>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Photo (Optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => onPhotoChange(event.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#ff5b14] file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
            />
            {photo ? (
              <div className="mt-2 flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <span className="truncate pr-3">{photo.name}</span>
                <button
                  type="button"
                  onClick={() => onPhotoChange(null)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  Remove
                </button>
              </div>
            ) : null}
            <p className="mt-1 text-xs text-slate-500">
              Photo upload support depends on Strava API permissions for your app.
            </p>
          </div>

          {!isConnected ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              You may be asked to login to Strava before upload completes.
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting}
            className="rounded-md bg-[#ff5b14] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSubmitting ? "Uploading..." : "Upload To Strava"}
          </button>
        </div>
      </div>
    </div>
  );
}
