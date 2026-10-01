// tema1/afisare.ts — helper comun pentru scripturile de verificare.

/** Tipareste istoricul exact ca in exemplul din tema: [tip] continut. */
export function afiseazaMesaje(mesaje: { getType(): string; content: unknown }[]) {
  for (const m of mesaje) {
    console.log(`[${m.getType()}]`, m.content);
  }
}
