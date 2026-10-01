"use client";

type ProgressBarProps = {
  value: number;
  label?: string;
  sublabel?: string;
  speed?: string;
  eta?: string;
};

export default function ProgressBar({
  value,
  label,
  sublabel,
  speed,
  eta,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const isComplete = clamped >= 100;

  return (
    <div className="w-full space-y-1 mt-1.5">
      <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
        <div className="flex items-center gap-2">
          {label && <span className="text-zinc-400">{label}</span>}
          {speed && <span>{speed}</span>}
        </div>
        <div className="flex items-center gap-2">
          {eta && <span>ETA {eta}</span>}
          <span className={isComplete ? "text-emerald-400" : "text-zinc-400"}>
            {sublabel ?? `${clamped.toFixed(0)}%`}
          </span>
        </div>
      </div>

      <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all duration-150 ${
            isComplete ? "bg-emerald-500" : "bg-zinc-200"
          }`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
