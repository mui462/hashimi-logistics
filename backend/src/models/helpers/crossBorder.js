/**
 * Supported cross-border lanes: US <-> CA and US <-> MX. Canada <-> Mexico is not a
 * supported lane. Cross-border freight is represented with the normal quote, load, and
 * shipment records, not a separate "international" system.
 */
export function isSupportedCrossBorderLane(originCountry, destinationCountry) {
  if (!originCountry || !destinationCountry || originCountry === destinationCountry) return false;
  return originCountry === 'US' || destinationCountry === 'US';
}

export function crossesBorder(originCountry, destinationCountry) {
  return Boolean(originCountry && destinationCountry && originCountry !== destinationCountry);
}
