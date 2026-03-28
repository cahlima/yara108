import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const parseSafeNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const sanitized = value.replace(/[^0-9,-]/g, '').replace(',', '.');
    const num = parseFloat(sanitized);
    return isNaN(num) ? 0 : num;
  }
  return 0;
};

export const formatCurrency = (value: number): string => {
  return (value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};
