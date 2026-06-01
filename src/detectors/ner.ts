import type { PiiMatch, Detector } from "../types.js";

/**
 * Heuristic Named Entity Recognition for German text.
 * Detects person names and locations via pattern matching.
 * Extensible to ML-based detection (@xenova/transformers) in v0.2.
 */
export class NerDetector implements Detector {
  name = "ner";

  // German name prefixes
  private namePatterns: RegExp[] = [
    /\b(?:Herr|Frau|Herrn|Dr\.|Prof\.|Professor)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s+[A-ZÄÖÜ][a-zäöüß]+)?)/g,
    /\b(?:Herr|Frau|Herrn)\s+([A-ZÄÖÜ][a-zäöüß]+(?:\s*-\s*[A-ZÄÖÜ][a-zäöüß]+)?)/g,
  ];

  // Common German cities (top 30 by population)
  private knownCities = new Set([
    "Berlin", "Hamburg", "München", "Köln", "Frankfurt",
    "Stuttgart", "Düsseldorf", "Leipzig", "Dortmund", "Essen",
    "Bremen", "Dresden", "Hannover", "Nürnberg", "Duisburg",
    "Bochum", "Wuppertal", "Bielefeld", "Bonn", "Münster",
    "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden", "Gelsenkirchen",
    "Mönchengladbach", "Braunschweig", "Chemnitz", "Kiel", "Aachen",
  ]);

  detect(text: string): PiiMatch[] {
    const matches: PiiMatch[] = [];
    const counters: Record<string, number> = {};

    // Name patterns
    for (const pattern of this.namePatterns) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(text)) !== null) {
        const fullMatch = m[0];
        counters["NAME"] = (counters["NAME"] || 0) + 1;
        matches.push({
          type: "name" as any, // Extended PII type
          original: fullMatch,
          replacement: `<NAME_${counters["NAME"]}>`,
          startIndex: m.index,
          endIndex: m.index + fullMatch.length,
        });
      }
    }

    // City detection
    const cityPattern = new RegExp(
      `\\b(${[...this.knownCities].join("|")})\\b`,
      "g",
    );
    let cityMatch: RegExpExecArray | null;
    while ((cityMatch = cityPattern.exec(text)) !== null) {
      const matched = cityMatch[0];
      // Avoid overlapping with existing matches
      const overlaps = matches.some(
        (m) => cityMatch!.index < m.endIndex && cityMatch!.index + matched.length > m.startIndex,
      );
      if (overlaps) continue;

      counters["CITY"] = (counters["CITY"] || 0) + 1;
      matches.push({
        type: "city" as any,
        original: matched,
        replacement: `<CITY_${counters["CITY"]}>`,
        startIndex: cityMatch.index,
        endIndex: cityMatch.index + matched.length,
      });
    }

    // Sort by position, remove overlaps
    return matches
      .sort((a, b) => a.startIndex - b.startIndex)
      .filter((m, i, arr) => {
        if (i === 0) return true;
        return m.startIndex >= arr[i - 1].endIndex;
      });
  }
}
