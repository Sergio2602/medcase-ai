"use client";

import { useEffect, useState } from "react";

/**
 * Lokales "Profil" für die Hero-Startseite — rein kosmetisch, kein Account,
 * nichts wird versendet (Sergio, 07.10.2026: "mach mal aus Spaß"). Name +
 * Avatar-Farbe + Ausbildungsstand landen nur in localStorage dieses Geräts.
 * Taucht bewusst nicht im Spiel-Header auf, nur auf der Hero/Home-Seite
 * (CenteredNav mit active="home") — kein neuer Pflichtschritt im Funnel,
 * rein optional über den Avatar-Button oben rechts.
 */

export type StatusKind = "vorklinik" | "klinik" | "pj" | "approbiert";

export type Profile = {
  name: string;
  avatarColor: string;
  statusKind: StatusKind;
  semester?: number; // nur bei vorklinik/klinik relevant
};

const PROFILE_KEY = "medcase:profile";

// Dieselbe Palette wie die Patienten-Avatare in app/page.tsx (AVATAR_COLORS) —
// bewusst nicht importiert/geteilt, um page.tsx nicht anzufassen; kleine
// Dopplung statt Kopplung zwischen den beiden Avatar-Systemen.
const PROFILE_COLORS = ["#EF9A9A", "#90CAF9", "#A5D6A7", "#FFD54F", "#CE93D8", "#FFAB73"];

const STATUS_OPTIONS: { key: StatusKind; label: string }[] = [
  { key: "vorklinik", label: "Vorklinik" },
  { key: "klinik", label: "Klinik" },
  { key: "pj", label: "PJ" },
  { key: "approbiert", label: "Approbierter Arzt" },
];

export function loadProfile(): Profile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Profile>;
    if (!p.name || typeof p.name !== "string") return null;
    const statusKind: StatusKind = STATUS_OPTIONS.some((o) => o.key === p.statusKind)
      ? (p.statusKind as StatusKind)
      : "vorklinik";
    return {
      name: p.name,
      avatarColor: typeof p.avatarColor === "string" ? p.avatarColor : PROFILE_COLORS[0],
      statusKind,
      semester: typeof p.semester === "number" ? p.semester : undefined,
    };
  } catch {
    return null;
  }
}

export function saveProfile(p: Profile) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // localStorage nicht verfügbar (Privatmodus o.ä.) — kein Fehler nach außen.
  }
}

export function initialsOf(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileCorner() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [open, setOpen] = useState(false);
  // Erst nach dem Mount aus localStorage lesen (wie der "returning"-Zustand
  // im StartScreen) — sonst weicht Server- von Client-Markup ab.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setProfile(loadProfile());
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="absolute right-0 top-0 hidden h-full items-center gap-2.5 sm:flex">
      {profile && (
        <span className="text-[12.5px] font-semibold text-white/85">
          Willkommen zurück, <span className="text-white">{profile.name}</span>
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={profile ? "Profil bearbeiten" : "Profil erstellen"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-white/30 text-[13px] font-extrabold text-white transition-colors hover:bg-white/10"
        style={
          profile
            ? { backgroundColor: profile.avatarColor, color: "#1f385b", borderColor: "transparent" }
            : undefined
        }
      >
        {profile ? initialsOf(profile.name) : <i className="ti ti-user-plus text-[16px]" aria-hidden="true" />}
      </button>
      {open && (
        <ProfileModal
          initial={profile}
          onClose={() => setOpen(false)}
          onSave={(p) => {
            saveProfile(p);
            setProfile(p);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

export function ProfileModal({
  initial,
  onClose,
  onSave,
}: {
  initial: Profile | null;
  onClose: () => void;
  onSave: (p: Profile) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.avatarColor ?? PROFILE_COLORS[0]);
  const [statusKind, setStatusKind] = useState<StatusKind>(initial?.statusKind ?? "vorklinik");
  const [semester, setSemester] = useState<number>(initial?.semester ?? 1);

  const needsSemester = statusKind === "vorklinik" || statusKind === "klinik";
  // Vorklinik umfasst in Deutschland nur Semester 1–4, Klinik bis Semester 10
  // (danach PJ) — bei Vorklinik/Klinik wird die Auswahl entsprechend gekappt.
  const maxSemester = statusKind === "vorklinik" ? 4 : 10;
  const canSave = name.trim().length > 0;

  function pickStatus(kind: StatusKind) {
    setStatusKind(kind);
    if (kind === "vorklinik" && semester > 4) setSemester(4);
  }

  function save() {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      avatarColor: color,
      statusKind,
      semester: needsSemester ? semester : undefined,
    });
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-t-[20px] border-[1.5px] bg-card sm:rounded-xl"
        style={{ borderColor: "#d8d6cd" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-2 pt-6">
          <h2 className="text-xl font-extrabold">Profil</h2>
        </div>

        {/* Update 07.10.2026 (Sergio): Untertitel-Satz entfernt, Name +
            Avatar-Farbe bilden den oberen Block (enger Abstand), Status +
            Semester folgen klar abgesetzt darunter. */}
        <div className="px-6 pb-2 pt-1">
          <label className="mb-1 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Name
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Dein Name"
            maxLength={40}
            autoFocus
            className="w-full rounded-lg border-[1.5px] border-card-border/20 bg-background px-3 py-2 text-sm font-semibold outline-none focus:border-accent"
          />
        </div>

        <div className="px-6 pb-2 pt-1.5">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Avatar-Farbe
          </span>
          <div className="flex gap-2">
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Farbe wählen`}
                aria-pressed={color === c}
                className={`h-8 w-8 rounded-full transition-transform ${
                  color === c ? "scale-110 ring-2 ring-accent ring-offset-2" : ""
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <div className="px-6 pb-4 pt-3">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Status
          </span>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => pickStatus(opt.key)}
                className={`rounded-lg border-[1.5px] px-3 py-2 text-left text-[13px] font-semibold transition-colors ${
                  statusKind === opt.key
                    ? "border-accent bg-accent/[0.08] text-accent"
                    : "border-card-border/20 text-foreground hover:border-accent/40"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {needsSemester && (
            <div className="mt-2.5 flex items-center gap-2">
              <label className="text-[12.5px] font-semibold text-muted">Semester</label>
              <select
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
                className="rounded-lg border-[1.5px] border-card-border/20 bg-background px-2.5 py-1.5 text-sm font-semibold outline-none focus:border-accent"
              >
                {Array.from({ length: maxSemester }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}. Semester
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6 pt-2" style={{ borderTop: "1.5px solid #d8d6cd" }}>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border-[1.5px] border-card-border/20 py-3 text-sm font-bold text-muted transition-colors hover:border-accent/40"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
