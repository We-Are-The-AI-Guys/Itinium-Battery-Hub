// Unknown/placeholder manufacturers use TAB weights without identity review.
// A genuinely unrecognised named manufacturer still uses the normal validation.
export function isUnknownManufacturerValue(value: string | null | undefined): boolean {
  return ["", "n/a", "na", "unknown", "other", "none", "-", "?"]
    .includes(String(value ?? "").trim().toLowerCase());
}
