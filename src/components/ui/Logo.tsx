/**
 * Brand logo component used in nav bars and auth pages.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-2xl" role="img" aria-label="music">
        &#x1F3B5;
      </span>
      <span className="font-heading font-bold text-saffron-800 text-xl">
        Sangeeta Gurukulam
      </span>
    </div>
  );
}
