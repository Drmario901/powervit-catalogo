import { type ClassValue, clsx } from "clsx";

/** Combina clases de forma condicional (estilo Shadcn/Radix) */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
