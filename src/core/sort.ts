export const SORT_STEP = 100;

/** Insert a card using integer ranks, leaving the unranked tail untouched. */
export function planReorder<T>(
  list: T[],
  dragged: T,
  index: number,
  sortOf: (item: T) => number | undefined,
): Map<T, number> {
  if (!Number.isInteger(index) || index < 0 || index > list.length) {
    throw new RangeError('The insertion position must be inside the target list.');
  }
  const ordered = list.slice();
  ordered.splice(index, 0, dragged);
  const ranks = ordered.map((item, position) => position === index ? undefined : sortOf(item));
  const left = index === 0 ? 0 : ranks[index - 1];
  const right = ranks[index + 1];
  const candidate = left === undefined ? NaN : right === undefined
    ? left + SORT_STEP
    : left + Math.floor((right - left) / 2);
  // Avoid fractional, negative, overflowing, or colliding ranks from hand-edited tags.
  if (Number.isSafeInteger(candidate) && candidate > (left ?? 0) &&
      (right === undefined || candidate < right)) {
    return new Map([[dragged, candidate]]);
  }

  // Compact the ranked prefix and the insertion into evenly spaced positive integers.
  // A reverse scan finds the boundary without assigning ranks to the unranked tail.
  let boundary = ordered.length;
  while (boundary > index + 1 && ranks[boundary - 1] === undefined) boundary--;
  return new Map(ordered.slice(0, boundary).flatMap((item, position) => {
    const rank = SORT_STEP * (position + 1);
    return position === index || ranks[position] !== rank ? [[item, rank] as [T, number]] : [];
  }));
}
