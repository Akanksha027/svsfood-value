export default function PoweredBy() {
  return (
    <footer className="w-full py-4 px-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
      <span>Powered by</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/svslogo.png"
        alt="SVS"
        width={112}
        className="w-[112px] h-auto object-contain select-none"
      />
      <span>.</span>
    </footer>
  );
}
