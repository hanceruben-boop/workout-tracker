import { useState, useEffect, useRef, useCallback } from "react";

/**
 * EMOM Timer
 * Drop-in component for the workout tracker.
 *
 * Runs "X reps every minute for Y minutes" intervals with audio + haptic cues.
 * Logs weight per round so completed rounds can be handed back to the tracker
 * via the optional onComplete callback.
 *
 * Usage:
 *   <EmomTimer
 *     exercise="Seated Row"
 *     defaultReps={12}
 *     onComplete={(rounds) => saveToWorkout(rounds)}
 *   />
 */

const IDLE = "idle";
const RUNNING = "running";
const PAUSED = "paused";
const DONE = "done";

export default function EmomTimer({
  exercise = "Seated Row",
  defaultReps = 12,
  defaultRounds = 5,
  defaultInterval = 60,
  onComplete,
}) {
  const [reps, setReps] = useState(defaultReps);
  const [totalRounds, setTotalRounds] = useState(defaultRounds);
  const [intervalSecs, setIntervalSecs] = useState(defaultInterval);
  const [status, setStatus] = useState(IDLE);
  const [round, setRound] = useState(1);
  const [remaining, setRemaining] = useState(defaultInterval);
  const [log, setLog] = useState([]);
  const [weight, setWeight] = useState("");

  const audioCtxRef = useRef(null);
  const deadlineRef = useRef(null);
  const rafRef = useRef(null);
  const lastBeepRef = useRef(null);

  /* ---------- audio ---------- */
  const ensureAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const beep = useCallback(
    (freq, duration = 0.12) => {
      const ctx = ensureAudio();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + duration
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    },
    [ensureAudio]
  );

  const buzz = useCallback((pattern) => {
    if (navigator.vibrate) navigator.vibrate(pattern);
  }, []);

  /* ---------- ticking ---------- */
  useEffect(() => {
    if (status !== RUNNING) return;

    const tick = () => {
      const msLeft = deadlineRef.current - performance.now();
      const secsLeft = Math.max(0, msLeft / 1000);
      setRemaining(secsLeft);

      const whole = Math.ceil(secsLeft);
      if (whole <= 3 && whole > 0 && lastBeepRef.current !== whole) {
        lastBeepRef.current = whole;
        beep(660, 0.08);
        buzz(40);
      }

      if (msLeft <= 0) {
        lastBeepRef.current = null;
        setRound((prev) => {
          const next = prev + 1;
          if (next > totalRounds) {
            setStatus(DONE);
            beep(880, 0.5);
            buzz([120, 80, 120, 80, 240]);
            return prev;
          }
          beep(1040, 0.22);
          buzz([100, 60, 100]);
          deadlineRef.current = performance.now() + intervalSecs * 1000;
          return next;
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status, totalRounds, intervalSecs, beep, buzz]);

  /* ---------- controls ---------- */
  const start = () => {
    ensureAudio();
    beep(1040, 0.22);
    buzz([100, 60, 100]);
    deadlineRef.current = performance.now() + intervalSecs * 1000;
    lastBeepRef.current = null;
    setRound(1);
    setRemaining(intervalSecs);
    setLog([]);
    setStatus(RUNNING);
  };

  const pause = () => {
    cancelAnimationFrame(rafRef.current);
    setStatus(PAUSED);
  };

  const resume = () => {
    ensureAudio();
    deadlineRef.current = performance.now() + remaining * 1000;
    setStatus(RUNNING);
  };

  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    setStatus(IDLE);
    setRound(1);
    setRemaining(intervalSecs);
    setLog([]);
    lastBeepRef.current = null;
  };

  const logRound = () => {
    const w = parseFloat(weight);
    if (Number.isNaN(w)) return;
    setLog((prev) => {
      const next = [...prev.filter((r) => r.round !== round), { round, reps, weight: w }];
      return next.sort((a, b) => a.round - b.round);
    });
  };

  const finish = () => {
    if (onComplete) onComplete(log);
    reset();
  };

  /* ---------- derived ---------- */
  const pct = status === IDLE ? 1 : remaining / intervalSecs;
  const secsDisplay = Math.ceil(remaining);
  const mm = String(Math.floor(secsDisplay / 60)).padStart(2, "0");
  const ss = String(secsDisplay % 60).padStart(2, "0");
  const urgent = status === RUNNING && secsDisplay <= 3;

  const R = 88;
  const CIRC = 2 * Math.PI * R;
  const configurable = status === IDLE;

  return (
    <div className="w-full max-w-md mx-auto bg-[#0b0f0b] text-neutral-200 font-mono rounded-2xl border border-green-900/60 p-6 select-none">
      {/* header */}
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg tracking-tight text-neutral-100">{exercise}</h2>
        <span className="text-[11px] uppercase tracking-[0.2em] text-green-600">
          emom
        </span>
      </div>
      <p className="text-xs text-neutral-500 mb-6">
        {reps} reps every {intervalSecs}s &times; {totalRounds}
      </p>

      {/* dial */}
      <div className="relative flex items-center justify-center mb-6">
        <svg width="220" height="220" className="-rotate-90">
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke="#14301c"
            strokeWidth="10"
          />
          <circle
            cx="110"
            cy="110"
            r={R}
            fill="none"
            stroke={urgent ? "#f87171" : "#4ade80"}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - pct)}
            style={{ transition: "stroke 150ms linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-6xl tabular-nums tracking-tighter ${
              urgent ? "text-red-400" : "text-neutral-50"
            }`}
          >
            {mm}:{ss}
          </span>
          <span className="mt-2 text-[11px] uppercase tracking-[0.25em] text-neutral-500">
            {status === DONE ? "complete" : `round ${round} / ${totalRounds}`}
          </span>
        </div>
      </div>

      {/* setup */}
      {configurable && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Field label="reps" value={reps} onChange={setReps} min={1} />
          <Field label="rounds" value={totalRounds} onChange={setTotalRounds} min={1} />
          <Field
            label="interval"
            value={intervalSecs}
            onChange={(v) => {
              setIntervalSecs(v);
              setRemaining(v);
            }}
            min={10}
            step={5}
          />
        </div>
      )}

      {/* weight logging */}
      {(status === RUNNING || status === PAUSED || status === DONE) && (
        <div className="flex gap-2 mb-5">
          <input
            type="number"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="kg"
            className="flex-1 bg-[#111811] border border-green-900/60 rounded-lg px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-green-600"
          />
          <button
            onClick={logRound}
            className="px-4 py-2 rounded-lg border border-green-800 text-green-400 text-sm hover:bg-green-950 active:scale-95 transition"
          >
            log set {round}
          </button>
        </div>
      )}

      {/* controls */}
      <div className="flex gap-3">
        {status === IDLE && <Primary onClick={start}>start</Primary>}
        {status === RUNNING && (
          <>
            <Secondary onClick={pause}>pause</Secondary>
            <Secondary onClick={reset}>reset</Secondary>
          </>
        )}
        {status === PAUSED && (
          <>
            <Primary onClick={resume}>resume</Primary>
            <Secondary onClick={reset}>reset</Secondary>
          </>
        )}
        {status === DONE && (
          <>
            <Primary onClick={finish}>save</Primary>
            <Secondary onClick={reset}>again</Secondary>
          </>
        )}
      </div>

      {/* log */}
      {log.length > 0 && (
        <div className="mt-6 pt-5 border-t border-green-950">
          <div className="grid grid-cols-5 gap-2">
            {log.map((r) => (
              <div
                key={r.round}
                className="bg-[#0f1a0f] border border-green-900/70 rounded-lg py-2 text-center"
              >
                <div className="text-[9px] uppercase tracking-widest text-green-700">
                  set {r.round}
                </div>
                <div className="text-base text-neutral-100 leading-tight">
                  {r.reps}
                </div>
                <div className="text-[10px] text-neutral-500">{r.weight}kg</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- small pieces ---------- */

function Field({ label, value, onChange, min = 0, step = 1 }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-neutral-500 mb-1">
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || min))}
        className="w-full bg-[#111811] border border-green-900/60 rounded-lg px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-green-600"
      />
    </label>
  );
}

function Primary({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-3 rounded-xl bg-green-500 text-[#04180a] text-sm uppercase tracking-[0.15em] font-semibold hover:bg-green-400 active:scale-[0.98] transition"
    >
      {children}
    </button>
  );
}

function Secondary({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 py-3 rounded-xl border border-green-900 text-neutral-300 text-sm uppercase tracking-[0.15em] hover:bg-green-950/60 active:scale-[0.98] transition"
    >
      {children}
    </button>
  );
}
