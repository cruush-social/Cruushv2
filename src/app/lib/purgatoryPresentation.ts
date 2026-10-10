/** Display precedence only; never use this for membership or privacy decisions. */
export function showPurgatoryPresentation(outOfSight: boolean | undefined, travelling: boolean | undefined) {
  return outOfSight === true && travelling !== true;
}
