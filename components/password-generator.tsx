"use client";

import { useState } from "react";
import { FiChevronDown, FiRefreshCw } from "react-icons/fi";
import { generatePassword } from "@/lib/password-gen";

export default function PasswordGenerator({
  onUse,
}: {
  onUse: (password: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [preview, setPreview] = useState(() =>
    generatePassword({ length: 20 }),
  );

  function regen(next?: Partial<{
    length: number;
    uppercase: boolean;
    lowercase: boolean;
    numbers: boolean;
    symbols: boolean;
  }>) {
    const opts = {
      length: next?.length ?? length,
      uppercase: next?.uppercase ?? uppercase,
      lowercase: next?.lowercase ?? lowercase,
      numbers: next?.numbers ?? numbers,
      symbols: next?.symbols ?? symbols,
    };
    setPreview(generatePassword(opts));
  }

  if (!open) {
    return (
      <p className="mt-2 text-xs text-slate-500">
        Don&apos;t have a password yet?{" "}
        <button
          type="button"
          className="font-bold text-[#f16a34] hover:text-[#d95f2e] underline-offset-2 hover:underline"
          onClick={() => {
            regen();
            setOpen(true);
          }}
        >
          Generate
        </button>
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Password generator
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="text-slate-500 hover:text-[#f16a34] p-1"
            onClick={() => regen()}
            title="Regenerate"
          >
            <FiRefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            className="text-slate-400 hover:text-slate-600 p-1"
            onClick={() => setOpen(false)}
            title="Collapse"
          >
            <FiChevronDown className="w-3.5 h-3.5 rotate-180" />
          </button>
        </div>
      </div>
      <p className="font-mono text-xs text-slate-800 break-all bg-white border border-slate-200 rounded-lg px-2.5 py-2">
        {preview}
      </p>
      <div className="flex items-center gap-2">
        <label className="text-[11px] font-semibold text-slate-500 w-14">
          Length
        </label>
        <input
          type="range"
          min={8}
          max={48}
          value={length}
          onChange={(e) => {
            const v = Number(e.target.value);
            setLength(v);
            regen({ length: v });
          }}
          className="flex-1 accent-[#f16a34]"
        />
        <span className="text-xs font-bold text-slate-700 w-6 text-right">
          {length}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] font-semibold text-slate-600">
        {(
          [
            ["A–Z", uppercase, setUppercase, "uppercase"],
            ["a–z", lowercase, setLowercase, "lowercase"],
            ["0–9", numbers, setNumbers, "numbers"],
            ["!@#", symbols, setSymbols, "symbols"],
          ] as const
        ).map(([label, checked, setChecked, key]) => (
          <label
            key={key}
            className="inline-flex items-center gap-1.5 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const v = e.target.checked;
                setChecked(v);
                regen({ [key]: v });
              }}
              className="accent-[#f16a34]"
            />
            {label}
          </label>
        ))}
      </div>
      <button
        type="button"
        className="admin-btn-secondary w-full h-9"
        onClick={() => {
          onUse(preview);
          regen();
          setOpen(false);
        }}
      >
        Use this password
      </button>
    </div>
  );
}
