/**
 * Human-readable labels for the database enums.
 *
 * Pages were formatting these with `s.charAt(0) + s.slice(1).toLowerCase()`,
 * which is right for MINIBUS ("Minibus") and wrong for SUV — it rendered "Suv"
 * on the car detail page. Acronyms need a lookup, not an algorithm.
 */

/** Enum values that are acronyms and must keep their capitals. */
const ACRONYMS = new Set(["SUV"]);

/**
 * Turns an enum value into something readable: SUV → "SUV",
 * MINIBUS → "Minibus", FULL_TO_FULL → "Full to full".
 */
export function formatEnumLabel(value: string): string {
  if (ACRONYMS.has(value)) return value;

  return value
    .split("_")
    .map((word, i) =>
      i === 0
        ? word.charAt(0) + word.slice(1).toLowerCase()
        : word.toLowerCase(),
    )
    .join(" ");
}
