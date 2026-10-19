/** Authored flat-lay illustration: an outfit laid out on a linen-coloured surface. */
export function FlatLay() {
  const piece = (i: number, r: number) => ({ className: "settle", style: { ["--i" as string]: i, ["--r" as string]: `${r}deg`, transformOrigin: "center", transformBox: "fill-box" } as React.CSSProperties });
  return (
    <svg viewBox="0 0 480 580" role="img" aria-label="Illustrazione di un outfit: giacca, maglia, pantaloni e scarpe disposti su un piano" className="w-full">
      <defs>
        <filter id="soft" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#2b2a28" floodOpacity="0.16" />
        </filter>
      </defs>
      <rect width="480" height="580" rx="36" fill="#d8f24a" />
      <rect x="14" y="14" width="452" height="552" rx="26" fill="none" stroke="#15140f" strokeOpacity="0.9" strokeWidth="2.5" />

      {/* jacket */}
      <g {...piece(0, -3)} filter="url(#soft)">
        <path d="M62 120 L128 96 Q168 84 196 108 L214 330 L120 346 L84 268 Z" fill="#ff5a36" />
        <path d="M196 108 L214 330" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="3" />
      </g>
      {/* shirt */}
      <g {...piece(1, 2)} filter="url(#soft)">
        <path d="M232 84 L292 66 Q340 98 388 66 L448 90 L470 168 L418 188 L404 160 L404 330 L252 330 L252 160 L238 188 L186 168 Z" fill="#ffffff" transform="translate(-30 6) scale(0.86)" />
        <path d="M316 82 L316 300" stroke="#2b2a28" strokeOpacity="0.1" strokeWidth="3" transform="translate(-30 6) scale(0.86)" />
      </g>
      {/* trousers */}
      <g {...piece(2, -1)} filter="url(#soft)">
        <path d="M196 340 L330 340 L352 530 L286 530 L264 410 L242 530 L176 530 Z" fill="#c8b6ff" />
        <rect x="196" y="340" width="134" height="16" fill="#2b2a28" fillOpacity="0.12" />
      </g>
      {/* shoes */}
      <g {...piece(3, 4)} filter="url(#soft)">
        <path d="M356 462 Q356 432 386 432 L404 444 Q430 440 448 456 L462 464 Q472 470 472 484 L472 498 L356 498 Z" fill="#15140f" />
        <rect x="356" y="492" width="116" height="10" rx="5" fill="#ffffff" />
      </g>
      {/* belt / accessory */}
      <g {...piece(4, -6)} filter="url(#soft)">
        <rect x="46" y="400" width="104" height="14" rx="7" fill="#a9d8ff" />
        <rect x="104" y="396" width="22" height="22" rx="4" fill="none" stroke="#15140f" strokeWidth="3" />
      </g>
    </svg>
  );
}
