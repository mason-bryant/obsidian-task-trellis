[← Task Trellis](../README.md)

# Code provenance

Reviewed October 25, 2026, against release 0.1.9.

The repository's notices identify adaptations from [4D Eisenhower Matrix](https://github.com/krcaljaroslav/4D-eisenhower-matrix), by Jaroslav Krčál, in two files:

| File in 0.1.9 | Lines, including comments and subsequent additions |
|---|---:|
| `src/core/sort.ts` | 39 |
| `src/core/filters.ts` | 55 |
| Total | 94 |

This is the size of the identified files, **not a claim that exactly 94 lines were copied**, nor an exhaustive similarity analysis of upstream history. The original adaptation was recorded in the initial repository commit; later filter work expanded that file.

Both implementations have now been replaced against Task Trellis's behavior and regression tests. Sorting constructs an insertion sequence and rank plan with safe-integer validation. Filtering evaluates folder/tag dimensions and explicit note properties, with complete-segment matching. Existing public function signatures and supported matching/order behavior are retained. Inherited JavaScript properties are deliberately excluded, and invalid insertion positions are rejected.

This was not a clean-room process: the previous implementations were available to the developer. The rewrite does not erase history or guarantee community-directory eligibility. The upstream credit and full MIT notice remain in THIRD_PARTY_NOTICES.txt and in the generated bundle. The root LICENSE now contains only Task Trellis's standard MIT license text.

The bundled `monkey-around` dependency remains under ISC, with its notice preserved separately. It supports guarded integration with Obsidian's view lifecycle.

## Permission and directory policy

The [MIT license](https://opensource.org/license/mit) grants permission to use, modify and redistribute code subject to its notice conditions; it does not require a separate permission request. Obsidian's [directory policies](https://docs.obsidian.md/community-directory/developer-policies) separately restrict forks and inherited code. There is no recorded author approval or directory eligibility determination in this repository. Disclose this history to reviewers rather than asserting that a rewrite automatically settles their policy.

The maintainer decided on October 25, 2026 to proceed with submission without a separate eligibility inquiry, given the replaced implementations and retained credit. Historical notices remain intact; this is a maintainer decision, not a recorded author approval or Obsidian determination.
