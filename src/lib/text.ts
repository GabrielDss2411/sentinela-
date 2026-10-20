/** Lowercase, accent-free, single-spaced — so "sao joao" finds "São João". */
export function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
