"use client";

export function RangeSlider({ id, label, lower, upper, min, max, unit, onLowerChange, onUpperChange }: {
  id: string; label: string; lower: number; upper: number; min: number; max: number; unit: string;
  onLowerChange: (value: number) => void; onUpperChange: (value: number) => void;
}) {
  return <div className="range" role="group" aria-labelledby={`${id}-label`}>
    <div className="range-head"><span id={`${id}-label`}>{label}</span><output>{lower}–{upper} {unit}</output></div>
    <div className="dual-range">
      <div className="dual-range-track" />
      <div className="dual-range-selection" style={{ left: `${(lower-min)/(max-min)*100}%`, right: `${(max-upper)/(max-min)*100}%` }} />
      <input id={`${id}-minimum`} type="range" min={min} max={max} step={1} value={lower}
        aria-label={`Minimum ${label.toLowerCase()}`} aria-valuetext={`${lower} ${unit}`} aria-valuemax={upper-1}
        onChange={event => onLowerChange(Math.min(Number(event.target.value), upper-1))} />
      <input id={`${id}-maximum`} type="range" min={min} max={max} step={1} value={upper}
        aria-label={`Maximum ${label.toLowerCase()}`} aria-valuetext={`${upper} ${unit}`} aria-valuemin={lower+1}
        onChange={event => onUpperChange(Math.max(Number(event.target.value), lower+1))} />
    </div>
    <div className="range-endpoints"><span>Min {lower} {unit}</span><span>Max {upper} {unit}</span></div>
  </div>;
}
