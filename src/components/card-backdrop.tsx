/**
 * The background of the screens outside the app (login, recovery): a few of Guaca's cards floating
 * behind the form, with the same look as the cards in Inicio (gradient, rings, the light sweep and
 * the chip). Pure decoration: no real data, hidden from screen readers.
 */
const CARDS = [
  { color: "#6D4AFF", className: "-left-40 top-[2%] w-60 -rotate-[14deg] sm:left-[4%] sm:top-[4%] sm:w-80", chip: true, delay: "0s" },
  { color: "#0F9488", className: "-right-40 top-[24%] w-56 rotate-[11deg] sm:right-[5%] sm:top-[16%] sm:w-72", chip: false, delay: "-3s" },
  { color: "#E5533D", className: "-left-40 bottom-[20%] w-56 rotate-[8deg] sm:left-[10%] sm:bottom-[10%] sm:w-64", chip: false, delay: "-6s" },
  { color: "#2563EB", className: "-right-36 -bottom-16 w-64 -rotate-[9deg] sm:right-[12%] sm:bottom-[4%] sm:w-80", chip: true, delay: "-2s" },
  { color: "#DB2777", className: "hidden sm:block left-[30%] -top-16 w-56 rotate-[4deg]", chip: false, delay: "-4.5s" },
];

export function CardBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* A soft glow in the brand colour so the glass of the form has something to bend. */}
      <span className="absolute left-1/2 top-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-3xl" />
      {CARDS.map((card) => (
        <span key={card.color} className={`absolute ${card.className}`}>
          <span
            className="float-card relative isolate block aspect-[1.586] overflow-hidden rounded-3xl shadow-[0_24px_50px_-20px_rgba(30,20,90,0.6)]"
            style={{ background: `linear-gradient(135deg, ${card.color} 0%, color-mix(in oklab, ${card.color} 70%, black) 100%)`, animationDelay: card.delay }}
          >
            <span className="absolute -right-16 -top-20 size-56 rounded-full border-[28px] border-white opacity-15" />
            <span className="absolute -bottom-24 -left-10 size-56 rounded-full bg-white opacity-10" />
            <span className="absolute inset-0" style={{ background: "linear-gradient(115deg, rgba(255,255,255,0.22) 0%, transparent 38%)" }} />
            {card.chip && (
              <span
                className="absolute left-6 top-1/3 h-8 w-11 rounded-md"
                style={{ background: "linear-gradient(135deg, #f6e7a8, #c9a74a)", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.15)" }}
              />
            )}
            <span className="absolute bottom-6 left-6 h-2.5 w-24 rounded-full bg-white/45" />
            <span className="absolute bottom-6 right-6 h-2.5 w-10 rounded-full bg-white/35" />
          </span>
        </span>
      ))}
    </div>
  );
}
