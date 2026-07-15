"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Target, CheckCircle2, Circle, Plus, Trash2, Pencil, Play, Square, BookOpen,
  Dumbbell, FolderKanban, BarChart3, ShieldCheck, Settings, Sun, Moon, Search,
  Download, Upload, Menu, X, Clock, Flame, ChevronRight, Timer as TimerIcon,
  CalendarDays, TrendingUp, Check, Bell, LogOut, Cloud, Languages, Archive,
  AlarmClock, Undo2, Lock, AlertTriangle, Star
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend
} from "recharts";
import { pendientesDe } from "@/lib/pendientes";
import { subscribeToPush, unsubscribeFromPush, pushStatus, pushConfigured } from "@/lib/push";
import { supabase } from "@/lib/supabase";

export { pendientesDe };

/* ============================================================
   HELPERS — fechas, semanas, utilidades
   ============================================================ */

const pad = (n) => String(n).padStart(2, "0");
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// Clave de semana ISO: "2026-W28"
const weekKeyOf = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${pad(weekNo)}`;
};
const dateFromKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const keyFromDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Día siguiente a una clave: "2026-07-15" -> "2026-07-16"
const nextDayKey = (k) => {
  const d = dateFromKey(k);
  d.setDate(d.getDate() + 1);
  return keyFromDate(d);
};
// Distancia en días entre dos claves (b - a)
const daysBetweenKeys = (a, b) =>
  Math.round((dateFromKey(b) - dateFromKey(a)) / 86400000);
// "jueves 16 de julio"
const fmtDayLong = (k) =>
  dateFromKey(k).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
const fmtDayShort = (k) =>
  dateFromKey(k).toLocaleDateString("es-CO", { weekday: "long", day: "numeric" });
const weekOfDayKey = (dayKey) => weekKeyOf(dateFromKey(dayKey));
const shiftWeek = (wk, delta) => {
  // devuelve la clave de semana desplazada `delta` semanas desde hoy
  const d = new Date();
  d.setDate(d.getDate() + delta * 7);
  return weekKeyOf(d);
};
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const fmtClock = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

/* ============================================================
   DATOS POR DEFECTO
   ============================================================ */

const STAGES = ["Planeación", "Diseño", "Desarrollo", "Pruebas", "Finalizado"];

const emptyDay = () => ({
  goals: [], workouts: [], readingMinutes: 0, deepWorkMinutes: 0,
  cycles: 0, german: { done: false, minutes: 0 },
  sleepHours: null, screenMinutes: null,
});

export const defaultData = {
  weeklyObjectives: {},          // { "2026-W28": "texto" }

  // Registro EN CURSO: lo que está sobre la mesa ahora mismo.
  // Vive aquí hasta que presiones "Registrar día"; ahí se archiva en `days`
  // y este queda en blanco, listo para el día siguiente.
  current: { forDate: null, ...emptyDay() },

  days: {},                      // Días ya registrados. Histórico: no se toca más.
  weeks: {},                     // Semanas cerradas. { "2026-W28": { sleepAvg, screenAvg, rating, notes, ...snapshot } }

  projects: [],
  rules: [
    "No usar redes sociales",
    "Leer todos los días",
    "Entrenar",
    "Dormir mínimo 8 horas",
    "Tomar mínimo 2 litros de agua",
  ].map((t) => ({ id: uid(), text: t })),
  reading: { book: "", plannedMinutes: 30 },
  german: { plannedMinutes: 20 },
  pomodoro: { work: 25, brk: 5, cycles: 4 },
  alarm: { enabled: true, hour: 19, goals: true, reading: true, german: true, lastFired: null },
  settings: { theme: "light" },
};

/* Migración de datos existentes al nuevo modelo.
   Se aplica una sola vez al cargar; nunca borra nada. */
export function migrateData(d) {
  const out = { ...d };

  if (!out.current) {
    // Lo que hubieras escrito hoy con la versión anterior pasa a ser el registro en curso.
    const tk = todayKey();
    const hoy = out.days?.[tk];
    out.current = { ...emptyDay(), ...(hoy || {}), forDate: tk };
    if (hoy) {
      const days = { ...out.days };
      delete days[tk];              // deja de estar duplicado en el histórico
      out.days = days;
    }
  }
  if (!out.current.forDate) out.current.forDate = todayKey();
  if (!out.current.german) out.current.german = { done: false, minutes: 0 };

  if (!out.weeks) out.weeks = {};
  if (!out.german) out.german = { plannedMinutes: 20 };
  if (!out.alarm) out.alarm = { ...defaultData.alarm };

  return out;
}

/* Cierra el registro en curso: lo archiva y deja la mesa limpia para el día siguiente. */
export function registerDay(d) {
  const fecha = d.current.forDate || todayKey();
  const { forDate, ...registro } = d.current;
  return {
    ...d,
    days: { ...d.days, [fecha]: registro },
    current: { ...emptyDay(), forDate: nextDayKey(fecha) },
  };
}



/* ============================================================
   NOTIFICACIONES Y SONIDO
   ============================================================ */

const notify = (title, body) => {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch (e) { /* entorno sin soporte */ }
};
const askNotifPermission = () => {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  } catch (e) {}
};
const playChime = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.001, t0);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.55);
      o.start(t0); o.stop(t0 + 0.6);
    });
  } catch (e) {}
};

/* ============================================================
   PRIMITIVAS DE UI
   ============================================================ */

const Card = ({ dark, children, className = "" }) => (
  <div
    className={`rounded-2xl border p-5 transition-colors duration-300 ${
      dark ? "bg-zinc-900 border-zinc-800" : "bg-white border-zinc-200"
    } ${className}`}
    style={{ boxShadow: dark ? "0 1px 3px rgba(0,0,0,.4)" : "0 1px 3px rgba(16,24,40,.06), 0 1px 2px rgba(16,24,40,.04)" }}
  >
    {children}
  </div>
);

const SectionTitle = ({ dark, icon: Icon, title, right }) => (
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <Icon size={17} className="text-indigo-500" />
      <h2 className={`text-sm font-semibold tracking-wide ${dark ? "text-zinc-100" : "text-zinc-800"}`}>{title}</h2>
    </div>
    {right}
  </div>
);

const IconBtn = ({ dark, onClick, children, title }) => (
  <button
    onClick={onClick} title={title}
    className={`p-1.5 rounded-lg transition-colors ${
      dark ? "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800" : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100"
    }`}
  >{children}</button>
);

const Progress = ({ dark, value, color = "bg-indigo-500", h = "h-2" }) => (
  <div className={`w-full ${h} rounded-full overflow-hidden ${dark ? "bg-zinc-800" : "bg-zinc-100"}`}>
    <div
      className={`${h} ${color} rounded-full transition-all duration-500`}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

const TextInput = ({ dark, className = "", ...props }) => (
  <input
    {...props}
    className={`w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-indigo-500 ${
      dark ? "bg-zinc-950 border-zinc-800 text-zinc-100 placeholder-zinc-600"
           : "bg-white border-zinc-200 text-zinc-800 placeholder-zinc-400"
    } ${className}`}
  />
);

const PrimaryBtn = ({ children, onClick, className = "" }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white text-sm font-medium px-4 py-2 transition-all ${className}`}
  >{children}</button>
);

const GhostBtn = ({ dark, children, onClick, className = "" }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1.5 rounded-xl border text-sm font-medium px-4 py-2 transition-all active:scale-95 ${
      dark ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
    } ${className}`}
  >{children}</button>
);

/* Texto editable en línea (clic en el lápiz para editar) */
function InlineEdit({ dark, value, onSave, placeholder, textarea = false, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { onSave(draft.trim()); setEditing(false); };
  if (editing) {
    return textarea ? (
      <textarea
        autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} rows={2}
        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500 resize-none ${
          dark ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-800"
        }`}
      />
    ) : (
      <input
        autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
        onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()}
        className={`w-full rounded-lg border px-2 py-1 text-sm outline-none focus:border-indigo-500 ${
          dark ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-800"
        }`}
      />
    );
  }
  return (
    <div className={`group flex items-start gap-2 ${className}`}>
      <span className={`${value ? "" : dark ? "text-zinc-600" : "text-zinc-400"}`}>{value || placeholder}</span>
      <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 transition-opacity">
        <Pencil size={13} className="text-zinc-400 hover:text-indigo-500" />
      </button>
    </div>
  );
}

/* ============================================================
   1 · OBJETIVO SEMANAL
   ============================================================ */

function WeeklyObjective({ dark, data, setData }) {
  const wk = weekKeyOf(new Date());
  const value = data.weeklyObjectives[wk] || "";
  const save = (txt) =>
    setData((d) => ({ ...d, weeklyObjectives: { ...d.weeklyObjectives, [wk]: txt } }));
  return (
    <Card dark={dark} className="border-l-4 border-l-indigo-500">
      <div className="flex items-center gap-2 mb-2">
        <Target size={16} className="text-indigo-500" />
        <span className={`text-xs font-semibold uppercase tracking-widest ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
          Objetivo principal de la semana · {wk}
        </span>
      </div>
      <div className={`text-lg font-semibold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
        <InlineEdit dark={dark} value={value} onSave={save} textarea
          placeholder="Escribe aquí el objetivo que define tu semana…" />
      </div>
    </Card>
  );
}

/* ============================================================
   2 · ENFOQUE DEL DÍA (objetivos diarios)
   ============================================================ */

function DailyGoals({ dark, data, setData, search }) {
  const day = data.current;
  const goals = (day.goals || []).filter(
    (g) => !search || g.text.toLowerCase().includes(search.toLowerCase())
  );
  const patch = (fn) => setData((d) => ({ ...d, current: fn(d.current) }));
  const add = () => patch((c) => ({ ...c, goals: [...c.goals, { id: uid(), text: "Nuevo objetivo", done: false }] }));
  const toggle = (id) => patch((c) => ({ ...c, goals: c.goals.map((g) => (g.id === id ? { ...g, done: !g.done } : g)) }));
  const edit = (id, text) => patch((c) => ({ ...c, goals: c.goals.map((g) => (g.id === id ? { ...g, text } : g)) }));
  const del = (id) => patch((c) => ({ ...c, goals: c.goals.filter((g) => g.id !== id) }));
  const doneCount = (day.goals || []).filter((g) => g.done).length;

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={Flame} title="Enfoque del día"
        right={<span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{doneCount}/{(day.goals || []).length} completados</span>} />
      {(day.goals || []).length > 0 && (
        <div className="mb-4"><Progress dark={dark} value={(doneCount / day.goals.length) * 100} /></div>
      )}
      <div className="space-y-1">
        {goals.map((g) => (
          <div key={g.id} className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-50"}`}>
            <button onClick={() => toggle(g.id)} className="shrink-0">
              {g.done
                ? <CheckCircle2 size={19} className="text-indigo-500" />
                : <Circle size={19} className={dark ? "text-zinc-600" : "text-zinc-300"} />}
            </button>
            <div className={`flex-1 text-sm ${g.done ? "line-through " + (dark ? "text-zinc-600" : "text-zinc-400") : dark ? "text-zinc-200" : "text-zinc-700"}`}>
              <InlineEdit dark={dark} value={g.text} onSave={(t) => t && edit(g.id, t)} placeholder="Objetivo…" />
            </div>
            <IconBtn dark={dark} onClick={() => del(g.id)} title="Eliminar"><Trash2 size={14} /></IconBtn>
          </div>
        ))}
        {goals.length === 0 && (
          <p className={`text-sm py-3 ${dark ? "text-zinc-600" : "text-zinc-400"}`}>
            Define hasta 3 objetivos clave. Menos es más.
          </p>
        )}
      </div>
      <button onClick={add} className={`mt-3 flex items-center gap-1.5 text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors`}>
        <Plus size={15} /> Agregar objetivo
      </button>
    </Card>
  );
}

/* ============================================================
   3 · TRABAJO PROFUNDO (temporizador Pomodoro)
   ============================================================ */

function DeepWork({ dark, data, setData }) {
  const cfg = data.pomodoro;
  const [phase, setPhase] = useState("idle"); // idle | work | break | done
  const [remaining, setRemaining] = useState(cfg.work * 60);
  const [cycle, setCycle] = useState(1);
  const endRef = useRef(null);
  const phaseRef = useRef("idle");
  const cycleRef = useRef(1);
  phaseRef.current = phase; cycleRef.current = cycle;

  // Si cambia la duración configurada mientras el temporizador está detenido,
  // el reloj se actualiza de inmediato para reflejar el nuevo valor.
  useEffect(() => {
    if (phase === "idle" || phase === "done") setRemaining(cfg.work * 60);
  }, [cfg.work, phase]);

  const setCfg = (k, v) =>
    setData((d) => ({ ...d, pomodoro: { ...d.pomodoro, [k]: Math.max(1, Number(v) || 1) } }));

  const addMinutes = useCallback((mins, addCycle) => {
    if (mins <= 0 && !addCycle) return;
    setData((d) => ({
      ...d,
      current: {
        ...d.current,
        deepWorkMinutes: (d.current.deepWorkMinutes || 0) + mins,
        cycles: (d.current.cycles || 0) + (addCycle ? 1 : 0),
      },
    }));
  }, [setData]);

  // Reloj basado en timestamp para mantener precisión
  useEffect(() => {
    if (phase !== "work" && phase !== "break") return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((endRef.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(iv);
        playChime();
        if (phaseRef.current === "work") {
          addMinutes(cfg.work, true);
          notify("Bloque de trabajo completado", "Comienza tu descanso. Respira.");
          setPhase("break");
          endRef.current = Date.now() + cfg.brk * 60 * 1000;
          setRemaining(cfg.brk * 60);
        } else {
          notify("Descanso terminado", cycleRef.current < cfg.cycles ? "Nuevo bloque de trabajo profundo." : "Sesión completada. Excelente trabajo.");
          if (cycleRef.current < cfg.cycles) {
            setCycle((c) => c + 1);
            setPhase("work");
            endRef.current = Date.now() + cfg.work * 60 * 1000;
            setRemaining(cfg.work * 60);
          } else {
            setPhase("done");
          }
        }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [phase, cfg, addMinutes]);

  const start = () => {
    askNotifPermission();
    setCycle(1);
    setPhase("work");
    endRef.current = Date.now() + cfg.work * 60 * 1000;
    setRemaining(cfg.work * 60);
  };
  const stop = () => {
    if (phase === "work") {
      const elapsed = Math.floor((cfg.work * 60 - remaining) / 60);
      addMinutes(elapsed, false);
    }
    setPhase("idle");
    setRemaining(cfg.work * 60);
    setCycle(1);
  };

  const total = phase === "break" ? cfg.brk * 60 : cfg.work * 60;
  const pct = phase === "idle" || phase === "done" ? 0 : ((total - remaining) / total) * 100;

  // Estadísticas en curso / semana / mes.
  // El día en curso todavía no está en `days`, así que se suma aparte.
  const stats = useMemo(() => {
    const fd = data.current.forDate || todayKey();
    const wk = weekOfDayKey(fd);
    const month = fd.slice(0, 7);
    let week = 0, mon = 0;
    Object.entries(data.days).forEach(([k, v]) => {
      const m = v.deepWorkMinutes || 0;
      if (weekOfDayKey(k) === wk) week += m;
      if (k.slice(0, 7) === month) mon += m;
    });
    const today = data.current.deepWorkMinutes || 0;
    return { today, week: week + today, mon: mon + today };
  }, [data.days, data.current]);

  // Anillo de progreso SVG
  const R = 64, C = 2 * Math.PI * R;
  const phaseLabel = { idle: "Listo para empezar", work: "Trabajo profundo", break: "Descanso", done: "Sesión completada" }[phase];
  const ringColor = phase === "break" ? "#10b981" : "#6366f1";

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={TimerIcon} title="Trabajo Profundo"
        right={<span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>Ciclo {Math.min(cycle, cfg.cycles)}/{cfg.cycles}</span>} />

      <div className="flex flex-col items-center py-2">
        <div className="relative" style={{ width: 160, height: 160 }}>
          <svg width="160" height="160" viewBox="0 0 160 160" className="-rotate-90">
            <circle cx="80" cy="80" r={R} fill="none" strokeWidth="8" stroke={dark ? "#27272a" : "#f4f4f5"} />
            <circle cx="80" cy="80" r={R} fill="none" strokeWidth="8" stroke={ringColor}
              strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (pct / 100) * C}
              style={{ transition: "stroke-dashoffset .4s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold tabular-nums ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
              {phase === "idle" ? fmtClock(cfg.work * 60) : phase === "done" ? "✓" : fmtClock(remaining)}
            </span>
            <span className={`text-xs mt-1 ${phase === "break" ? "text-emerald-500" : "text-indigo-500"}`}>{phaseLabel}</span>
          </div>
        </div>

        <div className="w-full mt-4"><Progress dark={dark} value={pct} color={phase === "break" ? "bg-emerald-500" : "bg-indigo-500"} /></div>

        <div className="flex gap-3 mt-5">
          {phase === "idle" || phase === "done" ? (
            <PrimaryBtn onClick={start}><Play size={15} /> Iniciar</PrimaryBtn>
          ) : (
            <GhostBtn dark={dark} onClick={stop}><Square size={14} /> Detener</GhostBtn>
          )}
        </div>

        {/* Configuración rápida, editable directamente en la tarjeta */}
        <div className="flex flex-wrap justify-center gap-4 mt-5">
          {[["work", "Trabajo (min)"], ["brk", "Descanso (min)"], ["cycles", "Ciclos"]].map(([k, label]) => (
            <label key={k} className={`flex flex-col items-center gap-1 text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
              <input
                type="number" min="1" value={cfg[k]}
                disabled={phase === "work" || phase === "break"}
                onChange={(e) => setCfg(k, e.target.value)}
                className={`w-16 text-center rounded-lg border px-2 py-1 text-sm font-semibold outline-none focus:border-indigo-500 transition-colors disabled:opacity-40 ${
                  dark ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-800"
                }`}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-3 gap-3 mt-5 pt-4 border-t ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
        {[["En curso", stats.today], ["Semana", stats.week], ["Mes", stats.mon]].map(([label, v]) => (
          <div key={label} className="text-center">
            <div className={`text-lg font-bold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>{fmtMin(v)}</div>
            <div className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* Configuración del Pomodoro (usada en la pestaña lateral) */
function DeepWorkConfig({ dark, data, setData }) {
  const cfg = data.pomodoro;
  const set = (k, v) => setData((d) => ({ ...d, pomodoro: { ...d.pomodoro, [k]: Math.max(1, Number(v) || 1) } }));
  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={Settings} title="Configuración del temporizador" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[["work", "Trabajo (min)"], ["brk", "Descanso (min)"], ["cycles", "Ciclos"]].map(([k, label]) => (
          <div key={k}>
            <label className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{label}</label>
            <TextInput dark={dark} type="number" min="1" value={cfg[k]} onChange={(e) => set(k, e.target.value)} className="mt-1" />
          </div>
        ))}
      </div>
      <GhostBtn dark={dark} onClick={askNotifPermission} className="mt-4"><Bell size={14} /> Activar notificaciones del navegador</GhostBtn>
    </Card>
  );
}

/* ============================================================
   4 · ENTRENAMIENTOS DEL DÍA
   ============================================================ */

function Workouts({ dark, data, setData, search }) {
  const day = data.current;
  const patch = (fn) => setData((d) => ({ ...d, current: fn(d.current) }));
  const add = (name = "Nuevo entrenamiento") =>
    patch((c) => ({ ...c, workouts: [...(c.workouts || []), { id: uid(), name, duration: 45, desc: "", done: false }] }));
  const upd = (id, k, v) => patch((c) => ({ ...c, workouts: c.workouts.map((w) => (w.id === id ? { ...w, [k]: v } : w)) }));
  const del = (id) => patch((c) => ({ ...c, workouts: c.workouts.filter((w) => w.id !== id) }));
  const list = (day.workouts || []).filter((w) => !search || w.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={Dumbbell} title="Entrenamientos" />
      <div className="space-y-3">
        {list.map((w) => (
          <div key={w.id} className={`group rounded-xl border p-3 ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className={`font-medium text-sm flex-1 ${dark ? "text-zinc-100" : "text-zinc-800"}`}>
                <InlineEdit dark={dark} value={w.name} onSave={(t) => t && upd(w.id, "name", t)} placeholder="Nombre" />
              </div>
              <button
                onClick={() => upd(w.id, "done", !w.done)}
                className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                  w.done ? "bg-emerald-500 bg-opacity-10 text-emerald-500" : dark ? "bg-zinc-800 text-zinc-400" : "bg-zinc-100 text-zinc-500"
                }`}
              >{w.done ? "Completado" : "Pendiente"}</button>
              <IconBtn dark={dark} onClick={() => del(w.id)} title="Eliminar"><Trash2 size={14} /></IconBtn>
            </div>
            <div className={`flex items-center gap-2 mt-1 text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
              <Clock size={12} />
              <input
                type="number" min="1" value={w.duration}
                onChange={(e) => upd(w.id, "duration", Number(e.target.value) || 0)}
                className={`w-14 rounded-md border px-1.5 py-0.5 text-xs outline-none focus:border-indigo-500 ${
                  dark ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"
                }`}
              /> min
            </div>
            <div className={`text-xs mt-1.5 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
              <InlineEdit dark={dark} value={w.desc} onSave={(t) => upd(w.id, "desc", t)} placeholder="Añade una descripción…" />
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className={`text-sm py-2 ${dark ? "text-zinc-600" : "text-zinc-400"}`}>Sin entrenamientos programados.</p>
        )}
      </div>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button onClick={() => add("Running")} className="text-sm font-medium text-indigo-500 hover:text-indigo-400 flex items-center gap-1"><Plus size={14} /> Running</button>
        <button onClick={() => add("Gimnasio")} className="text-sm font-medium text-indigo-500 hover:text-indigo-400 flex items-center gap-1"><Plus size={14} /> Gimnasio</button>
        <button onClick={() => add()} className="text-sm font-medium text-indigo-500 hover:text-indigo-400 flex items-center gap-1"><Plus size={14} /> Otro</button>
      </div>
    </Card>
  );
}

/* ============================================================
   5 · LECTURA (cronómetro + registro diario)
   ============================================================ */

function Reading({ dark, data, setData }) {
  const day = data.current;
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0); // segundos de la sesión actual
  const startRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(iv);
  }, [running]);

  const start = () => { startRef.current = Date.now(); setElapsed(0); setRunning(true); };
  const stop = () => {
    setRunning(false);
    const mins = Math.round(elapsed / 60);
    if (mins > 0) {
      setData((d) => ({
        ...d,
        current: { ...d.current, readingMinutes: (d.current.readingMinutes || 0) + mins },
      }));
    }
    setElapsed(0);
  };
  const setMinutes = (v) =>
    setData((d) => ({ ...d, current: { ...d.current, readingMinutes: Math.max(0, Number(v) || 0) } }));
  const setBook = (t) => setData((d) => ({ ...d, reading: { ...d.reading, book: t } }));
  const setPlanned = (v) => setData((d) => ({ ...d, reading: { ...d.reading, plannedMinutes: Math.max(1, Number(v) || 1) } }));
  const done = day.readingMinutes || 0;
  const pct = (done / data.reading.plannedMinutes) * 100;

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={BookOpen} title="Lectura" />
      <div className={`text-sm font-medium mb-1 ${dark ? "text-zinc-100" : "text-zinc-800"}`}>
        <InlineEdit dark={dark} value={data.reading.book} onSave={setBook} placeholder="¿Qué libro estás leyendo?" />
      </div>
      <div className={`flex items-center gap-2 text-xs mb-3 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        Meta diaria:
        <input type="number" min="1" value={data.reading.plannedMinutes} onChange={(e) => setPlanned(e.target.value)}
          className={`w-14 rounded-md border px-1.5 py-0.5 text-xs outline-none focus:border-indigo-500 ${
            dark ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"
          }`} /> min
      </div>
      <Progress dark={dark} value={pct} color="bg-amber-500" />
      <div className={`flex justify-between items-center text-xs mt-1.5 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        <span className="flex items-center gap-1.5">
          Leído:
          <input type="number" min="0" value={done} onChange={(e) => setMinutes(e.target.value)}
            className={`w-14 rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none focus:border-indigo-500 ${
              dark ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-700"
            }`} />
          min
        </span>
        <span>{Math.min(100, Math.round(pct))}%</span>
      </div>
      <div className="flex items-center gap-3 mt-4">
        {running ? (
          <>
            <GhostBtn dark={dark} onClick={stop}><Square size={14} /> Detener</GhostBtn>
            <span className={`text-xl font-bold tabular-nums ${dark ? "text-zinc-100" : "text-zinc-900"}`}>{fmtClock(elapsed)}</span>
          </>
        ) : (
          <PrimaryBtn onClick={start} className="bg-amber-500 hover:bg-amber-400"><Play size={15} /> Iniciar lectura</PrimaryBtn>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   5b · ALEMÁN
   ============================================================ */

function German({ dark, data, setData }) {
  const g = data.current.german || { done: false, minutes: 0 };
  const meta = data.german?.plannedMinutes || 20;
  const set = (patch) =>
    setData((d) => ({ ...d, current: { ...d.current, german: { ...(d.current.german || {}), ...patch } } }));
  const setMeta = (v) =>
    setData((d) => ({ ...d, german: { ...d.german, plannedMinutes: Math.max(1, Number(v) || 1) } }));

  return (
    <Card dark={dark} className={g.done ? "border-l-4 border-l-emerald-500" : ""}>
      <SectionTitle dark={dark} icon={Languages} title="Alemán" />
      <p className={`text-sm mb-3 ${dark ? "text-zinc-300" : "text-zinc-700"}`}>¿Estudiaste alemán?</p>

      <div className="flex gap-2">
        <button
          onClick={() => set({ done: true, minutes: g.minutes || meta })}
          className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all active:scale-95 ${
            g.done
              ? "bg-emerald-500 border-emerald-500 text-white"
              : dark ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          }`}
        >
          <span className="inline-flex items-center gap-1.5"><Check size={15} /> Sí</span>
        </button>
        <button
          onClick={() => set({ done: false, minutes: 0 })}
          className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-all active:scale-95 ${
            !g.done
              ? dark ? "bg-zinc-800 border-zinc-700 text-zinc-200" : "bg-zinc-100 border-zinc-200 text-zinc-700"
              : dark ? "border-zinc-700 text-zinc-400 hover:bg-zinc-800" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
          }`}
        >
          <span className="inline-flex items-center gap-1.5"><X size={15} /> Todavía no</span>
        </button>
      </div>

      {g.done && (
        <div className={`flex items-center gap-2 text-xs mt-3 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
          Minutos
          <input type="number" min="0" value={g.minutes ?? 0} onChange={(e) => set({ minutes: Math.max(0, Number(e.target.value) || 0) })}
            className={`w-16 rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none focus:border-indigo-500 ${
              dark ? "bg-zinc-950 border-zinc-800 text-zinc-200" : "bg-white border-zinc-200 text-zinc-700"
            }`} />
        </div>
      )}

      <div className={`flex items-center gap-2 text-xs mt-3 pt-3 border-t ${dark ? "text-zinc-500 border-zinc-800" : "text-zinc-400 border-zinc-100"}`}>
        Meta diaria
        <input type="number" min="1" value={meta} onChange={(e) => setMeta(e.target.value)}
          className={`w-14 rounded-md border px-1.5 py-0.5 text-xs outline-none focus:border-indigo-500 ${
            dark ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"
          }`} /> min
      </div>
    </Card>
  );
}

/* ============================================================
   6 · PROYECTOS ACTIVOS
   ============================================================ */

function Projects({ dark, data, setData, search }) {
  const add = () =>
    setData((d) => ({
      ...d,
      projects: [...d.projects, { id: uid(), name: "Nuevo proyecto", desc: "", progress: 0, targetDate: "", stage: "Planeación" }],
    }));
  const upd = (id, k, v) => setData((d) => ({ ...d, projects: d.projects.map((p) => (p.id === id ? { ...p, [k]: v } : p)) }));
  const del = (id) => setData((d) => ({ ...d, projects: d.projects.filter((p) => p.id !== id) }));
  const list = data.projects.filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={FolderKanban} title="Proyectos Activos"
        right={<button onClick={add} className="text-sm font-medium text-indigo-500 hover:text-indigo-400 flex items-center gap-1"><Plus size={14} /> Nuevo</button>} />
      <div className="space-y-4">
        {list.map((p) => (
          <div key={p.id} className={`rounded-xl border p-4 ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className={`font-semibold text-sm ${dark ? "text-zinc-100" : "text-zinc-800"}`}>
                  <InlineEdit dark={dark} value={p.name} onSave={(t) => t && upd(p.id, "name", t)} placeholder="Nombre" />
                </div>
                <div className={`text-xs mt-0.5 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
                  <InlineEdit dark={dark} value={p.desc} onSave={(t) => upd(p.id, "desc", t)} placeholder="Descripción del proyecto…" />
                </div>
              </div>
              <IconBtn dark={dark} onClick={() => del(p.id)} title="Eliminar"><Trash2 size={14} /></IconBtn>
            </div>

            {/* Etapas */}
            <div className="flex items-center gap-1 mt-3 flex-wrap">
              {STAGES.map((s, i) => {
                const activeIdx = STAGES.indexOf(p.stage);
                const isDone = i < activeIdx, isActive = i === activeIdx;
                return (
                  <React.Fragment key={s}>
                    <button
                      onClick={() => upd(p.id, "stage", s)}
                      className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${
                        isActive ? "bg-indigo-600 text-white"
                        : isDone ? "text-indigo-500 " + (dark ? "bg-indigo-950" : "bg-indigo-50")
                        : dark ? "text-zinc-500 hover:bg-zinc-800" : "text-zinc-400 hover:bg-zinc-100"
                      }`}
                    >{s}</button>
                    {i < STAGES.length - 1 && <ChevronRight size={11} className={dark ? "text-zinc-700" : "text-zinc-300"} />}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Progreso y fecha */}
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1"><Progress dark={dark} value={p.progress} /></div>
              <input
                type="number" min="0" max="100" value={p.progress}
                onChange={(e) => upd(p.id, "progress", Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                className={`w-14 rounded-md border px-1.5 py-0.5 text-xs outline-none text-right focus:border-indigo-500 ${
                  dark ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"
                }`}
              />
              <span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>%</span>
              <div className={`flex items-center gap-1 text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                <CalendarDays size={12} />
                <input type="date" value={p.targetDate} onChange={(e) => upd(p.id, "targetDate", e.target.value)}
                  className={`rounded-md border px-1.5 py-0.5 text-xs outline-none focus:border-indigo-500 ${
                    dark ? "bg-zinc-950 border-zinc-800 text-zinc-300" : "bg-white border-zinc-200 text-zinc-600"
                  }`} />
              </div>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p className={`text-sm py-2 ${dark ? "text-zinc-600" : "text-zinc-400"}`}>Crea tu primer proyecto para hacer seguimiento de su avance.</p>
        )}
      </div>
    </Card>
  );
}

/* ============================================================
   8 · REGLAS / NO NEGOCIABLES — recordatorio fijo y editable
   ============================================================ */

function Rules({ dark, data, setData, search }) {
  const add = () => setData((d) => ({ ...d, rules: [...d.rules, { id: uid(), text: "Nueva regla" }] }));
  const edit = (id, t) => setData((d) => ({ ...d, rules: d.rules.map((r) => (r.id === id ? { ...r, text: t } : r)) }));
  const del = (id) => setData((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
  const list = data.rules.filter((r) => !search || r.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={ShieldCheck} title="No Negociables"
        right={<span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{data.rules.length} reglas</span>} />
      <div className="space-y-1">
        {list.map((r) => (
          <div key={r.id} className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${dark ? "hover:bg-zinc-800" : "hover:bg-zinc-50"}`}>
            <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <div className={`flex-1 text-sm font-medium ${dark ? "text-zinc-200" : "text-zinc-700"}`}>
              <InlineEdit dark={dark} value={r.text} onSave={(t) => t && edit(r.id, t)} placeholder="Regla…" />
            </div>
            <IconBtn dark={dark} onClick={() => del(r.id)} title="Eliminar"><Trash2 size={14} /></IconBtn>
          </div>
        ))}
        {list.length === 0 && (
          <p className={`text-sm py-2 ${dark ? "text-zinc-600" : "text-zinc-400"}`}>
            Escribe aquí los principios que no negocias contigo misma.
          </p>
        )}
      </div>
      <button onClick={add} className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-500 hover:text-emerald-400 transition-colors">
        <Plus size={15} /> Agregar regla
      </button>
    </Card>
  );
}

/* ============================================================
   7 · DASHBOARD SEMANAL — métricas, comparación e históricos
   ============================================================ */

/* Métricas que la app calcula sola, a partir de los días registrados de esa semana.
   Si `includeCurrent` viene, el día que aún está sobre la mesa también cuenta. */
function weekMetrics(data, wk, includeCurrent = true) {
  const registros = Object.entries(data.days)
    .filter(([k]) => weekOfDayKey(k) === wk)
    .map(([, v]) => v);

  // El día en curso todavía no está archivado, pero ya cuenta para la semana en curso.
  const fd = data.current?.forDate;
  if (includeCurrent && fd && weekOfDayKey(fd) === wk) registros.push(data.current);

  let sleep = [], screen = [], run = 0, gym = 0, deep = 0, read = 0;
  let goalsDone = 0, goalsTotal = 0, germanDays = 0, germanMin = 0;

  registros.forEach((v) => {
    if (v.sleepHours != null) sleep.push(v.sleepHours);
    if (v.screenMinutes != null) screen.push(v.screenMinutes);
    (v.workouts || []).forEach((w) => {
      if (!w.done) return;
      const n = (w.name || "").toLowerCase();
      if (n.includes("run") || n.includes("correr") || n.includes("trote")) run++;
      else if (n.includes("gim") || n.includes("gym") || n.includes("pesas")) gym++;
    });
    deep += v.deepWorkMinutes || 0;
    read += v.readingMinutes || 0;
    goalsDone += (v.goals || []).filter((g) => g.done).length;
    goalsTotal += (v.goals || []).length;
    if (v.german?.done) { germanDays++; germanMin += v.german.minutes || 0; }
  });

  const compliance = goalsTotal > 0 ? Math.round((goalsDone / goalsTotal) * 100) : 0;
  return {
    // Estos dos solo aparecen si vienen de datos antiguos; ahora se ingresan al cerrar la semana.
    sleepAvg: sleep.length ? +(sleep.reduce((a, b) => a + b, 0) / sleep.length).toFixed(1) : null,
    screenAvg: screen.length ? Math.round(screen.reduce((a, b) => a + b, 0) / screen.length) : null,
    run, gym,
    deepHours: +(deep / 60).toFixed(1),
    readMin: read,
    goalsDone, goalsTotal, compliance,
    germanDays, germanMin,
    daysCount: registros.length,
  };
}

/* Una semana ya cerrada devuelve sus números congelados.
   Una semana abierta se calcula en vivo. */
function weekSummary(data, wk) {
  const cerrada = data.weeks?.[wk];
  if (cerrada) return { ...cerrada, closed: true };
  return { ...weekMetrics(data, wk), closed: false };
}

function MetricCard({ dark, label, value, sub, color = "text-indigo-500" }) {
  return (
    <div className={`rounded-xl border p-3 ${dark ? "border-zinc-800 bg-zinc-950" : "border-zinc-100 bg-zinc-50"}`}>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      <div className={`text-xs mt-0.5 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>{label}</div>
      {sub && <div className={`text-xs ${dark ? "text-zinc-600" : "text-zinc-400"}`}>{sub}</div>}
    </div>
  );
}

/* Formulario de cierre: lo único que la app no puede saber por sí sola. */
function WeekClose({ dark, data, setData, wk, live }) {
  const cerrada = data.weeks?.[wk];
  const [draft, setDraft] = useState({ sleepAvg: "", screenAvg: "", rating: 0, notes: "" });
  const esDomingo = new Date().getDay() === 0;

  const cerrar = () => {
    const snapshot = weekMetrics(data, wk);   // congela lo calculado en este momento
    setData((d) => ({
      ...d,
      weeks: {
        ...d.weeks,
        [wk]: {
          ...snapshot,
          sleepAvg: draft.sleepAvg === "" ? snapshot.sleepAvg : Number(draft.sleepAvg),
          screenAvg: draft.screenAvg === "" ? snapshot.screenAvg : Number(draft.screenAvg),
          rating: draft.rating || null,
          notes: draft.notes.trim(),
          closedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const reabrir = () =>
    setData((d) => {
      const weeks = { ...d.weeks };
      delete weeks[wk];
      return { ...d, weeks };
    });

  if (cerrada) {
    return (
      <div className={`rounded-xl border p-4 mb-5 ${dark ? "border-emerald-900 bg-emerald-950 bg-opacity-30" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-emerald-600" />
            <span className="text-sm font-semibold text-emerald-600">Semana cerrada</span>
            {cerrada.rating && (
              <span className="flex items-center gap-0.5 ml-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} size={12} className={n <= cerrada.rating ? "text-amber-500 fill-amber-500" : dark ? "text-zinc-700" : "text-zinc-300"} />
                ))}
              </span>
            )}
          </div>
          <GhostBtn dark={dark} onClick={reabrir} className="!py-1 !px-3 text-xs">Reabrir</GhostBtn>
        </div>
        {cerrada.notes && (
          <p className={`text-sm mt-2 ${dark ? "text-zinc-300" : "text-zinc-600"}`}>{cerrada.notes}</p>
        )}
        <p className={`text-xs mt-2 ${dark ? "text-zinc-500" : "text-zinc-500"}`}>
          Estos números ya no cambian aunque edites días anteriores.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border p-4 mb-5 ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
      <div className="flex items-center gap-2 mb-1">
        <Lock size={14} className="text-indigo-500" />
        <span className={`text-sm font-semibold ${dark ? "text-zinc-200" : "text-zinc-800"}`}>Cerrar la semana</span>
      </div>
      <p className={`text-xs mb-4 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        {esDomingo
          ? "Es domingo. Completa lo que la app no puede medir y congela la semana."
          : "Normalmente esto se hace el domingo, pero puedes cerrarla cuando quieras."}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="block">
          <span className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>Sueño promedio (h)</span>
          <TextInput dark={dark} type="number" step="0.5" min="0" className="mt-1"
            placeholder={live.sleepAvg != null ? String(live.sleepAvg) : "7.5"}
            value={draft.sleepAvg} onChange={(e) => setDraft({ ...draft, sleepAvg: e.target.value })} />
        </label>
        <label className="block">
          <span className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>Pantalla al día (min)</span>
          <TextInput dark={dark} type="number" min="0" className="mt-1"
            placeholder={live.screenAvg != null ? String(live.screenAvg) : "180"}
            value={draft.screenAvg} onChange={(e) => setDraft({ ...draft, screenAvg: e.target.value })} />
        </label>
        <div>
          <span className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>¿Cómo estuvo la semana?</span>
          <div className="flex gap-1 mt-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setDraft({ ...draft, rating: n })} title={`${n} de 5`}>
                <Star size={20} className={n <= draft.rating ? "text-amber-500 fill-amber-500" : dark ? "text-zinc-700 hover:text-zinc-500" : "text-zinc-300 hover:text-zinc-400"} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <label className="block mt-4">
        <span className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>Qué aprendiste o qué cambiarías</span>
        <TextInput dark={dark} className="mt-1" placeholder="Opcional, pero es lo que más sirve al releerlo…"
          value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} />
      </label>

      <PrimaryBtn onClick={cerrar} className="mt-4"><Lock size={14} /> Cerrar semana {wk}</PrimaryBtn>
    </div>
  );
}

function WeeklyDashboard({ dark, data, setData }) {
  const wkNow = weekKeyOf(new Date());
  const wkPrev = shiftWeek(null, -1);
  const wkMonth = shiftWeek(null, -4);

  const mNow = useMemo(() => weekSummary(data, wkNow), [data, wkNow]);
  const mPrev = useMemo(() => weekSummary(data, wkPrev), [data, wkPrev]);
  const mMonth = useMemo(() => weekSummary(data, wkMonth), [data, wkMonth]);
  const liveNow = useMemo(() => weekMetrics(data, wkNow), [data, wkNow]);

  // Histórico: las semanas cerradas mandan; las abiertas se calculan.
  const historical = useMemo(() => {
    const deDias = Object.keys(data.days).map(weekOfDayKey);
    const deCerradas = Object.keys(data.weeks || {});
    const todas = [...new Set([...deDias, ...deCerradas])].sort();
    return todas.map((wk) => {
      const m = weekSummary(data, wk);
      return {
        semana: wk.slice(5),
        "Trabajo profundo (h)": m.deepHours,
        "Lectura (min)": m.readMin,
        "Cumplimiento (%)": m.compliance,
        "Alemán (días)": m.germanDays ?? 0,
      };
    });
  }, [data]);

  const comparison = [
    { name: "Hace un mes", "Trabajo profundo (h)": mMonth.deepHours, "Lectura (min)": mMonth.readMin, "Cumplimiento (%)": mMonth.compliance },
    { name: "Semana anterior", "Trabajo profundo (h)": mPrev.deepHours, "Lectura (min)": mPrev.readMin, "Cumplimiento (%)": mPrev.compliance },
    { name: "Semana actual", "Trabajo profundo (h)": mNow.deepHours, "Lectura (min)": mNow.readMin, "Cumplimiento (%)": mNow.compliance },
  ];

  const axisColor = dark ? "#71717a" : "#a1a1aa";
  const gridColor = dark ? "#27272a" : "#f4f4f5";
  const tipStyle = {
    background: dark ? "#18181b" : "#ffffff",
    border: `1px solid ${dark ? "#3f3f46" : "#e4e4e7"}`,
    borderRadius: 12, fontSize: 12,
  };

  return (
    <Card dark={dark} className="col-span-1 lg:col-span-2">
      <SectionTitle dark={dark} icon={BarChart3} title={`Dashboard Semanal · ${wkNow}`}
        right={<span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
          {mNow.daysCount ?? 0} {(mNow.daysCount ?? 0) === 1 ? "día registrado" : "días registrados"}
        </span>} />

      <WeekClose dark={dark} data={data} setData={setData} wk={wkNow} live={liveNow} />

      {/* Tarjetas de métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard dark={dark} label="Promedio de sueño" value={mNow.sleepAvg != null ? `${mNow.sleepAvg} h` : "—"} sub={mNow.closed ? null : "al cerrar la semana"} color="text-sky-500" />
        <MetricCard dark={dark} label="Tiempo de pantalla" value={mNow.screenAvg != null ? fmtMin(mNow.screenAvg) : "—"} sub={mNow.closed ? "promedio diario" : "al cerrar la semana"} color="text-rose-500" />
        <MetricCard dark={dark} label="Running" value={mNow.run} sub="sesiones" color="text-emerald-500" />
        <MetricCard dark={dark} label="Gimnasio" value={mNow.gym} sub="sesiones" color="text-emerald-500" />
        <MetricCard dark={dark} label="Trabajo profundo" value={`${mNow.deepHours} h`} color="text-indigo-500" />
        <MetricCard dark={dark} label="Lectura" value={fmtMin(mNow.readMin)} color="text-amber-500" />
        <MetricCard dark={dark} label="Alemán" value={`${mNow.germanDays ?? 0}/7`} sub="días" color="text-violet-500" />
        <MetricCard dark={dark} label="Cumplimiento" value={`${mNow.compliance}%`} sub={`${mNow.goalsDone ?? 0} de ${mNow.goalsTotal ?? 0} objetivos`} color={mNow.compliance >= 70 ? "text-emerald-500" : "text-amber-500"} />
      </div>

      {/* Comparación entre semanas */}
      <h3 className={`text-xs font-semibold uppercase tracking-widest mt-6 mb-3 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        Comparación · actual vs anterior vs hace un mes
      </h3>
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={comparison} barSize={22}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tipStyle} cursor={{ fill: dark ? "#27272a55" : "#f4f4f588" }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="Trabajo profundo (h)" fill="#6366f1" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Lectura (min)" fill="#f59e0b" radius={[6, 6, 0, 0]} />
            <Bar dataKey="Cumplimiento (%)" fill="#10b981" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Histórico */}
      <h3 className={`text-xs font-semibold uppercase tracking-widest mt-6 mb-1 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        Histórico semanal
      </h3>
      <p className={`text-xs mb-3 ${dark ? "text-zinc-600" : "text-zinc-400"}`}>
        Semana a semana. Las cerradas quedan congeladas; la actual se mueve hasta que la cierres.
      </p>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={historical}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: axisColor }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="Trabajo profundo (h)" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Lectura (min)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Cumplimiento (%)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="Alemán (días)" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {historical.length === 0 && (
        <p className={`text-sm text-center py-6 ${dark ? "text-zinc-600" : "text-zinc-400"}`}>
          Registra tu primer día y aquí empezará a construirse tu historia.
        </p>
      )}
    </Card>
  );
}

/* ============================================================
   GENERAL — exportar / importar datos
   ============================================================ */

function GeneralPanel({ dark, data, setData, saved }) {
  const fileRef = useRef(null);
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `dashboard-productividad-${todayKey()}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const importData = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(r.result);
        setData({ ...defaultData, ...parsed });
      } catch (err) { alert("El archivo no tiene un formato válido."); }
    };
    r.readAsText(f);
  };
  const setTheme = (theme) => setData((d) => ({ ...d, settings: { ...d.settings, theme } }));

  return (
    <div className="space-y-5">
      <Card dark={dark}>
        <SectionTitle dark={dark} icon={Settings} title="General" />
        <div className="flex flex-wrap items-center gap-3">
          <GhostBtn dark={dark} onClick={() => setTheme(dark ? "light" : "dark")}>
            {dark ? <Sun size={14} /> : <Moon size={14} />} Cambiar a modo {dark ? "claro" : "oscuro"}
          </GhostBtn>
          <GhostBtn dark={dark} onClick={exportData}><Download size={14} /> Exportar datos</GhostBtn>
          <GhostBtn dark={dark} onClick={() => fileRef.current?.click()}><Upload size={14} /> Importar datos</GhostBtn>
          <input ref={fileRef} type="file" accept=".json" onChange={importData} className="hidden" />
        </div>
        <p className={`text-xs mt-4 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
          Guardado automático en la nube {saved ? "✓ al día" : "…guardando"}. Tus datos se sincronizan entre todos tus dispositivos con tu cuenta, y el historial semanal nunca se sobrescribe.
        </p>
      </Card>
    </div>
  );
}

/* ============================================================
   REGISTRAR DÍA — archiva lo que está sobre la mesa y la deja limpia
   ============================================================ */

function RegisterDay({ dark, data, setData }) {
  const [confirming, setConfirming] = useState(false);
  const [undo, setUndo] = useState(null);   // snapshot para deshacer, solo en memoria

  // La ventana de arrepentimiento dura 30 s; después la tarjeta vuelve a la normalidad.
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 30000);
    return () => clearTimeout(t);
  }, [undo]);

  const fd = data.current.forDate || todayKey();
  const c = data.current;

  const resumen = [
    { label: "Objetivos", val: `${(c.goals || []).filter((g) => g.done).length}/${(c.goals || []).length}` },
    { label: "Trabajo profundo", val: fmtMin(c.deepWorkMinutes || 0) },
    { label: "Lectura", val: fmtMin(c.readingMinutes || 0) },
    { label: "Entrenamientos", val: `${(c.workouts || []).filter((w) => w.done).length}/${(c.workouts || []).length}` },
    { label: "Alemán", val: c.german?.done ? `Sí · ${c.german.minutes || 0}m` : "No" },
  ];

  const vacio =
    (c.goals || []).length === 0 && (c.workouts || []).length === 0 &&
    !(c.readingMinutes || 0) && !(c.deepWorkMinutes || 0) && !c.german?.done;

  const confirmar = () => {
    setUndo(data);                       // por si te arrepientes
    setData((d) => registerDay(d));
    setConfirming(false);
  };
  const deshacer = () => { setData(undo); setUndo(null); };

  // ¿Se te quedó un registro viejo sin cerrar?
  const atraso = daysBetweenKeys(fd, todayKey());

  if (undo) {
    return (
      <Card dark={dark} className="border-l-4 border-l-emerald-500">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-500" />
            <div>
              <div className={`text-sm font-semibold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
                Día registrado · {fmtDayLong(undo.current.forDate || todayKey())}
              </div>
              <div className={`text-xs mt-0.5 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
                La mesa quedó limpia. Ahora estás planeando {fmtDayShort(data.current.forDate)}.
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <GhostBtn dark={dark} onClick={deshacer}><Undo2 size={14} /> Deshacer</GhostBtn>
            <GhostBtn dark={dark} onClick={() => setUndo(null)}>Listo</GhostBtn>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={Archive} title="Cerrar el día"
        right={<span className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{fmtDayLong(fd)}</span>} />

      {atraso >= 1 && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 mb-4 ${dark ? "border-amber-900 bg-amber-950 bg-opacity-30" : "border-amber-200 bg-amber-50"}`}>
          <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <p className={`text-xs ${dark ? "text-amber-200" : "text-amber-800"}`}>
            Este registro es del <b>{fmtDayLong(fd)}</b> y hoy ya es {fmtDayShort(todayKey())}.
            Regístralo para archivarlo en su fecha correcta y empezar uno nuevo.
          </p>
        </div>
      )}

      <div className={`grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4`}>
        {resumen.map((r) => (
          <div key={r.label} className={`rounded-xl border px-3 py-2 ${dark ? "border-zinc-800 bg-zinc-950" : "border-zinc-100 bg-zinc-50"}`}>
            <div className={`text-sm font-bold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>{r.val}</div>
            <div className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>{r.label}</div>
          </div>
        ))}
      </div>

      {confirming ? (
        <div className={`rounded-xl border p-4 ${dark ? "border-indigo-800 bg-indigo-950 bg-opacity-30" : "border-indigo-200 bg-indigo-50"}`}>
          <p className={`text-sm font-medium ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
            Se guardará todo esto como tu {fmtDayLong(fd)}.
          </p>
          <p className={`text-xs mt-1 ${dark ? "text-zinc-400" : "text-zinc-600"}`}>
            La página queda en blanco para que escribas el plan de {fmtDayShort(nextDayKey(fd))}.
            Tu objetivo de la semana, proyectos y reglas se quedan donde están.
          </p>
          <div className="flex gap-2 mt-4">
            <PrimaryBtn onClick={confirmar}><Check size={15} /> Registrar</PrimaryBtn>
            <GhostBtn dark={dark} onClick={() => setConfirming(false)}>Cancelar</GhostBtn>
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={() => setConfirming(true)}
            disabled={vacio}
            className={`w-full inline-flex items-center justify-center gap-2 rounded-xl text-white text-sm font-semibold px-4 py-3 transition-all ${
              vacio ? "bg-zinc-400 cursor-not-allowed opacity-50" : "bg-indigo-600 hover:bg-indigo-500 active:scale-[.99]"
            }`}
          >
            <Archive size={16} /> Registrar día · {fmtDayShort(fd)}
          </button>
          <p className={`text-xs mt-2 text-center ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
            {vacio
              ? "Todavía no hay nada que registrar."
              : "Archiva el día y deja la página lista para el siguiente."}
          </p>
        </>
      )}
    </Card>
  );
}

/* ============================================================
   ALARMA — te avisa si a tu hora quedan pendientes
   ============================================================ */

function useAlarm(data, setData) {
  const ref = useRef({ data, setData });
  ref.current = { data, setData };

  useEffect(() => {
    const check = () => {
      const { data: d, setData: sd } = ref.current;
      const a = d?.alarm;
      if (!a?.enabled) return;
      const ahora = new Date();
      if (ahora.getHours() !== Number(a.hour)) return;
      if (a.lastFired === todayKey()) return;         // una vez al día, no cada minuto
      const pend = pendientesDe(d);
      if (pend.length === 0) return;
      notify("Enfoque · te falta algo hoy", pend.join(" · "));
      playChime();
      sd((x) => ({ ...x, alarm: { ...x.alarm, lastFired: todayKey() } }));
    };
    const iv = setInterval(check, 60000);
    check();
    return () => clearInterval(iv);
  }, []);
}

function AlarmSettings({ dark, data, setData }) {
  const a = data.alarm || {};
  const set = (patch) => setData((d) => ({ ...d, alarm: { ...d.alarm, ...patch } }));
  const pend = pendientesDe(data);

  return (
    <Card dark={dark}>
      <SectionTitle dark={dark} icon={AlarmClock} title="Recordatorio diario"
        right={
          <button
            onClick={() => { if (!a.enabled) askNotifPermission(); set({ enabled: !a.enabled }); }}
            className={`relative w-10 h-5 rounded-full transition-colors ${a.enabled ? "bg-indigo-600" : dark ? "bg-zinc-700" : "bg-zinc-300"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${a.enabled ? "left-[22px]" : "left-0.5"}`} />
          </button>
        } />

      <p className={`text-sm ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
        Si a la hora que elijas todavía te falta algo del día, la app te avisa.
      </p>

      <div className={`flex items-center gap-2 mt-4 text-sm ${dark ? "text-zinc-300" : "text-zinc-700"}`}>
        Avísame a las
        <select
          value={a.hour ?? 19} onChange={(e) => set({ hour: Number(e.target.value) })}
          className={`rounded-lg border px-2 py-1.5 text-sm font-semibold outline-none focus:border-indigo-500 ${
            dark ? "bg-zinc-950 border-zinc-800 text-zinc-100" : "bg-white border-zinc-200 text-zinc-800"
          }`}
        >
          {[18, 19, 20, 21, 22].map((h) => (
            <option key={h} value={h}>{h > 12 ? `${h - 12}:00 pm` : `${h}:00 am`}</option>
          ))}
        </select>
      </div>

      <div className="mt-4 space-y-2">
        <p className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>Recordarme sobre:</p>
        {[["goals", "Objetivos del día"], ["reading", "Lectura"], ["german", "Alemán"]].map(([k, label]) => (
          <label key={k} className={`flex items-center gap-2.5 text-sm cursor-pointer ${dark ? "text-zinc-300" : "text-zinc-700"}`}>
            <button onClick={() => set({ [k]: !a[k] })} className="shrink-0">
              {a[k] ? <CheckCircle2 size={18} className="text-indigo-500" /> : <Circle size={18} className={dark ? "text-zinc-600" : "text-zinc-300"} />}
            </button>
            {label}
          </label>
        ))}
      </div>

      <div className={`mt-4 pt-4 border-t ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
        <p className={`text-xs font-medium mb-1.5 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>Ahora mismo te falta:</p>
        {pend.length === 0 ? (
          <p className="text-sm text-emerald-500 flex items-center gap-1.5"><Check size={15} /> Nada. Vas al día.</p>
        ) : (
          <ul className={`text-sm space-y-0.5 ${dark ? "text-zinc-300" : "text-zinc-700"}`}>
            {pend.map((p) => <li key={p} className="flex items-center gap-1.5"><span className="w-1 h-1 rounded-full bg-amber-500" /> {p}</li>)}
          </ul>
        )}
      </div>

      <PushControl dark={dark} />
    </Card>
  );
}

/* Recordatorios con la app cerrada. Se activan por dispositivo:
   el celular y el PC son suscripciones distintas. */
function PushControl({ dark }) {
  const [estado, setEstado] = useState("cargando");   // cargando | on | off | denied | unsupported
  const [error, setError] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => { pushStatus().then(setEstado); }, []);

  const activar = async () => {
    setOcupado(true); setError(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const uid = s?.session?.user?.id;
      if (!uid) throw new Error("Vuelve a iniciar sesión.");
      await subscribeToPush(uid);
      setEstado("on");
    } catch (e) { setError(e.message); }
    setOcupado(false);
  };

  const desactivar = async () => {
    setOcupado(true); setError(null);
    try { await unsubscribeFromPush(); setEstado("off"); }
    catch (e) { setError(e.message); }
    setOcupado(false);
  };

  return (
    <div className={`mt-4 pt-4 border-t ${dark ? "border-zinc-800" : "border-zinc-100"}`}>
      <p className={`text-xs font-medium ${dark ? "text-zinc-400" : "text-zinc-500"}`}>Con la app cerrada</p>
      <p className={`text-xs mt-1 mb-3 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
        Se activa en cada dispositivo por separado. Hazlo también en el celular.
      </p>

      {!pushConfigured && (
        <p className={`text-xs ${dark ? "text-amber-400" : "text-amber-600"}`}>
          Falta configurar las variables de entorno en Vercel. Mira GUIA-RECORDATORIOS.md.
        </p>
      )}

      {pushConfigured && estado === "unsupported" && (
        <p className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
          Este navegador no admite recordatorios. En iPhone, instala la app en la pantalla de inicio y ábrela desde ahí.
        </p>
      )}

      {pushConfigured && estado === "denied" && (
        <p className={`text-xs ${dark ? "text-amber-400" : "text-amber-600"}`}>
          Bloqueaste las notificaciones para este sitio. Habilítalas en los ajustes del navegador y recarga.
        </p>
      )}

      {pushConfigured && estado === "on" && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-sm text-emerald-500 flex items-center gap-1.5">
            <CheckCircle2 size={15} /> Activo en este dispositivo
          </span>
          <GhostBtn dark={dark} onClick={desactivar} className="!py-1 !px-3 text-xs">
            {ocupado ? "…" : "Desactivar"}
          </GhostBtn>
        </div>
      )}

      {pushConfigured && estado === "off" && (
        <GhostBtn dark={dark} onClick={activar}>
          <Bell size={14} /> {ocupado ? "Activando…" : "Activar en este dispositivo"}
        </GhostBtn>
      )}

      {error && <p className="text-xs mt-2 text-rose-500">{error}</p>}
    </div>
  );
}

/* ============================================================
   NAVEGACIÓN LATERAL
   ============================================================ */

const TABS = [
  { id: "dashboard", label: "Dashboard", icon: BarChart3 },
  { id: "general", label: "General", icon: Settings },
  { id: "semanal", label: "Objetivo semanal", icon: Target },
  { id: "dia", label: "Metas del día", icon: Flame },
  { id: "deep", label: "Trabajo profundo", icon: TimerIcon },
  { id: "entreno", label: "Entrenamientos", icon: Dumbbell },
  { id: "lectura", label: "Lectura", icon: BookOpen },
  { id: "aleman", label: "Alemán", icon: Languages },
  { id: "proyectos", label: "Proyectos", icon: FolderKanban },
  { id: "metricas", label: "Dashboard semanal", icon: TrendingUp },
  { id: "reglas", label: "Reglas", icon: ShieldCheck },
  { id: "alarma", label: "Recordatorio", icon: AlarmClock },
];

function Sidebar({ dark, tab, setTab, open, setOpen }) {
  return (
    <>
      {/* Fondo oscuro en móvil */}
      {open && <div className="fixed inset-0 bg-black bg-opacity-40 z-30 lg:hidden" onClick={() => setOpen(false)} />}
      <aside
        className={`fixed lg:static z-40 h-full w-60 shrink-0 border-r flex flex-col transition-transform duration-300 ${
          dark ? "bg-zinc-950 border-zinc-800" : "bg-white border-zinc-200"
        } ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Flame size={16} className="text-white" />
          </div>
          <div>
            <div className={`text-sm font-bold leading-tight ${dark ? "text-zinc-100" : "text-zinc-900"}`}>Enfoque</div>
            <div className={`text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>Productividad personal</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? dark ? "bg-zinc-800 text-zinc-100" : "bg-zinc-100 text-zinc-900"
                  : dark ? "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
              }`}
            >
              <t.icon size={15} className={tab === t.id ? "text-indigo-500" : ""} />
              {t.label}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}

/* ============================================================
   APP PRINCIPAL
   ============================================================ */

export default function DashboardApp({ data, setData, saved, userEmail, onSignOut }) {
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  const dark = data?.settings?.theme === "dark";
  const toggleTheme = () =>
    setData((d) => ({ ...d, settings: { ...d.settings, theme: d.settings.theme === "dark" ? "light" : "dark" } }));

  useAlarm(data, setData);

  if (data === null) return null;

  // El encabezado muestra el día que estás registrando, que no siempre es hoy:
  // de noche ya estás trabajando sobre el de mañana.
  const fd = data.current?.forDate || todayKey();
  const esHoy = fd === todayKey();
  const today = fmtDayLong(fd);

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${dark ? "bg-zinc-950 dark" : "bg-zinc-50"}`}>
      <Sidebar dark={dark} tab={tab} setTab={setTab} open={menuOpen} setOpen={setMenuOpen} />

      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-y-auto">
        {/* Encabezado */}
        <header className={`sticky top-0 z-20 flex items-center gap-3 px-5 py-3.5 border-b backdrop-blur ${
          dark ? "border-zinc-800" : "border-zinc-200"
        }`} style={{ backgroundColor: dark ? "rgba(9,9,11,.85)" : "rgba(250,250,250,.85)" }}>
          <button onClick={() => setMenuOpen(true)} className={`lg:hidden ${dark ? "text-zinc-300" : "text-zinc-600"}`}>
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h1 className={`text-base font-bold capitalize truncate ${dark ? "text-zinc-100" : "text-zinc-900"}`}>{today}</h1>
            {!esHoy && (
              <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-600 bg-opacity-10 text-indigo-500">
                Planeando
              </span>
            )}
          </div>
          <div className={`hidden sm:flex items-center gap-2 rounded-xl border px-3 py-1.5 ${dark ? "border-zinc-800 bg-zinc-900" : "border-zinc-200 bg-white"}`}>
            <Search size={14} className="text-zinc-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…"
              className={`bg-transparent outline-none text-sm w-36 ${dark ? "text-zinc-200 placeholder-zinc-600" : "text-zinc-700 placeholder-zinc-400"}`}
            />
            {search && <button onClick={() => setSearch("")}><X size={13} className="text-zinc-400" /></button>}
          </div>
          <span className={`hidden md:flex items-center gap-1 text-xs ${saved ? (dark ? "text-zinc-600" : "text-zinc-400") : "text-amber-500"}`}>
            <Cloud size={12} /> {saved ? "Sincronizado" : "Guardando…"}
          </span>
          <button onClick={toggleTheme} className={`p-2 rounded-xl transition-colors ${dark ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"}`}>
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <button onClick={onSignOut} title={`Cerrar sesión (${userEmail || ""})`}
            className={`p-2 rounded-xl transition-colors ${dark ? "text-zinc-300 hover:bg-zinc-800" : "text-zinc-500 hover:bg-zinc-100"}`}>
            <LogOut size={17} />
          </button>
        </header>

        {/* Contenido */}
        <div className="p-5 lg:p-7 max-w-6xl w-full mx-auto space-y-5">
          {tab === "dashboard" && (
            <>
              <WeeklyObjective dark={dark} data={data} setData={setData} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                <div className="space-y-5">
                  <DailyGoals dark={dark} data={data} setData={setData} search={search} />
                  <Workouts dark={dark} data={data} setData={setData} search={search} />
                  <Reading dark={dark} data={data} setData={setData} />
                  <German dark={dark} data={data} setData={setData} />
                </div>
                <div className="space-y-5">
                  <DeepWork dark={dark} data={data} setData={setData} />
                  <Rules dark={dark} data={data} setData={setData} search={search} />
                  <Projects dark={dark} data={data} setData={setData} search={search} />
                </div>
              </div>

              {/* El cierre del día vive al final: es lo último que haces. */}
              <RegisterDay dark={dark} data={data} setData={setData} />

              <WeeklyDashboard dark={dark} data={data} setData={setData} />
            </>
          )}
          {tab === "general" && <GeneralPanel dark={dark} data={data} setData={setData} saved={saved} />}
          {tab === "semanal" && <WeeklyObjective dark={dark} data={data} setData={setData} />}
          {tab === "dia" && (
            <div className="space-y-5">
              <DailyGoals dark={dark} data={data} setData={setData} search={search} />
              <RegisterDay dark={dark} data={data} setData={setData} />
            </div>
          )}
          {tab === "aleman" && <German dark={dark} data={data} setData={setData} />}
          {tab === "alarma" && <AlarmSettings dark={dark} data={data} setData={setData} />}
          {tab === "deep" && (
            <div className="space-y-5">
              <DeepWork dark={dark} data={data} setData={setData} />
              <DeepWorkConfig dark={dark} data={data} setData={setData} />
            </div>
          )}
          {tab === "entreno" && <Workouts dark={dark} data={data} setData={setData} search={search} />}
          {tab === "lectura" && <Reading dark={dark} data={data} setData={setData} />}
          {tab === "proyectos" && <Projects dark={dark} data={data} setData={setData} search={search} />}
          {tab === "metricas" && <WeeklyDashboard dark={dark} data={data} setData={setData} />}
          {tab === "reglas" && <Rules dark={dark} data={data} setData={setData} search={search} />}
        </div>
      </main>
    </div>
  );
}
