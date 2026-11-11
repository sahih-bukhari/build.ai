import { Link } from "@tanstack/react-router";

/** Eight-pointed star made of two squares: the building block of tile work, and the mark of a "maker". */
export function StarMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M12.00 1.00 15.22 4.22 19.78 4.22 19.78 8.78 23.00 12.00 19.78 15.22 19.78 19.78 15.22 19.78 12.00 23.00 8.78 19.78 4.22 19.78 4.22 15.22 1.00 12.00 4.22 8.78 4.22 4.22 8.78 4.22z" />
      <circle cx="12" cy="12" r="3.2" fill="var(--background)" fillOpacity=".3" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="سازنده هوشمند — خانه">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow sm:h-9 sm:w-9">
        <StarMark />
      </span>
      <span className="font-display text-xl font-normal leading-none sm:text-2xl">سازنده هوشمند</span>
    </Link>
  );
}
