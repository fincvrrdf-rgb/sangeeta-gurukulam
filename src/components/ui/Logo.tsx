/**
 * Brand logo component used in nav bars and auth pages.
 * Displays the Sangeeta Gurukulam logo image from /public/logo.png.
 */
import Image from 'next/image';

interface LogoProps {
  className?: string;
  /** 'nav' = compact horizontal bar logo, 'auth' = large centered logo */
  variant?: 'nav' | 'auth';
}

export function Logo({ className = '', variant = 'nav' }: LogoProps) {
  if (variant === 'auth') {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <Image
          src="/logo.png"
          alt="Sangeeta Gurukulam"
          width={220}
          height={220}
          priority
          className="object-contain"
        />
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Image
        src="/logo.png"
        alt="Sangeeta Gurukulam"
        width={40}
        height={40}
        priority
        className="object-contain rounded"
      />
      <span className="font-heading font-bold text-saffron-800 text-lg leading-tight hidden sm:block">
        Sangeeta Gurukulam
      </span>
    </div>
  );
}
