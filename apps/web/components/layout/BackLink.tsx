import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import React from 'react';

interface BackLinkProps {
  href: string;
  children: React.ReactNode;
}

export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-slate-400 hover:text-white text-sm transition-colors">
      <ChevronLeft className="h-3.5 w-3.5" />
      {children}
    </Link>
  );
}
