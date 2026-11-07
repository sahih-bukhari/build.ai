import { Link } from "@tanstack/react-router";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-bold" aria-label="سازنده هوشمند — خانه">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-primary-foreground" aria-hidden>
          <path d="M12 2l2.2 5.8L20 10l-5.8 2.2L12 18l-2.2-5.8L4 10l5.8-2.2z" />
        </svg>
      </span>
      <span className="text-lg tracking-tight">سازنده هوشمند</span>
    </Link>
  );
}
