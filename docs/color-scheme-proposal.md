# Label color schemes

Implemented locally after palette review: gallery selections 1, 2, 6, 7, 9, 10, 15, 16, 22 and 23, plus the original colors named Trellis. See [Use colored labels](labels.md#choose-a-color-scheme) for behavior and instructions.

Colors and the Previous scheme snapshot are written together to board properties. Snapshots preserve exact custom colors by stable label ID. Task tags and label names are not rewritten. Tests cover restoration after serialization, reordered/renamed/deleted/new labels, unchanged schemes, empty boards, failed writes, cancellation and overlapping writes.
