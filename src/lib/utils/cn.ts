import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Tailwind のクラス名を条件付きで結合し、衝突を解決する */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
