import { describe, it, expect } from "bun:test";
import { NerDetector } from "../src/detectors/ner.js";

const detector = new NerDetector();

describe("NerDetector", () => {
  it("detects 'Herr Nachname' pattern", () => {
    const matches = detector.detect("Herr Müller wohnt in Berlin");
    const names = matches.filter((m) => m.type === "name");
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names[0].original).toContain("Müller");
  });

  it("detects 'Frau Vorname Nachname' pattern", () => {
    const matches = detector.detect("Frau Anna Schmidt ist zuständig");
    const names = matches.filter((m) => m.type === "name");
    expect(names.length).toBeGreaterThanOrEqual(1);
    expect(names[0].replacement).toMatch(/^<NAME_\d+>$/);
  });

  it("detects 'Dr. Nachname' pattern", () => {
    const matches = detector.detect("Dr. Weber hat den Bericht erstellt");
    const names = matches.filter((m) => m.type === "name");
    expect(names.length).toBeGreaterThanOrEqual(1);
  });

  it("detects known cities", () => {
    const matches = detector.detect("Das Büro ist in Hamburg, Außenstelle in München");
    const cities = matches.filter((m) => m.type === "city");
    expect(cities.length).toBeGreaterThanOrEqual(2);
    expect(matches.some((m) => m.original === "Hamburg")).toBe(true);
    expect(matches.some((m) => m.original === "München")).toBe(true);
  });

  it("returns empty array for text without names or cities", () => {
    const matches = detector.detect("Die Software wurde aktualisiert.");
    expect(matches.length).toBe(0);
  });

  it("generates correct placeholder format", () => {
    const matches = detector.detect("Herr Meier und Frau Schulz");
    const names = matches.filter((m) => m.type === "name");
    expect(names[0].replacement).toBe("<NAME_1>");
    expect(names[1].replacement).toBe("<NAME_2>");
  });
});
