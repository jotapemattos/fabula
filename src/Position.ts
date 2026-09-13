/**
 * Fractional index keys for shelf ordering.
 *
 * A position is a sortable string. Between any two positions another position can
 * always be generated, so inserting or moving a book updates one row and never
 * touches its neighbours.
 *
 * Keys are read as fractions written in base 36, with `ALPHABET` supplying the
 * digits. The alphabet is listed in ascending character-code order, which is what
 * makes digit order and string-comparison order the same thing: JavaScript's `<`
 * and SQLite's default `BINARY` collation both sort these keys correctly with no
 * parsing and no special collation.
 */
import { Brand, Data, Schema } from "effect";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** The lowest digit. No position may end in it — see `Position`. */
const FIRST = ALPHABET[0]!;

const valueOf = (char: string): number => ALPHABET.indexOf(char);

const charFor = (value: number): string => ALPHABET[value]!;

/**
 * Sentinel for "this key has no digit at this position".
 *
 * Below the lowest real digit, because a key that has run out of digits sorts
 * before every extension of itself: `"3" < "30"`.
 */
const BELOW = -1;

/** Sentinel for the upper key having no digit at this position: above every digit. */
const ABOVE = ALPHABET.length;

/**
 * A well-formed position: non-empty, written only in `ALPHABET`, and never ending
 * in the lowest digit.
 *
 * That last rule is what keeps every position openable. A trailing lowest digit
 * adds no value — `"30"` and `"3"` are the same fraction, as `0.50` and `0.5` are
 * — so the pair would be adjacent with nothing well-formed between them.
 *
 * Decode at the edges (a SQL row, an RPC payload — ADR 9) and the brand carries
 * the guarantee inward, so nothing downstream has to re-check a key.
 */
export const Position = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((key: string) =>
      key.length > 0 && [...key].every((char) => ALPHABET.includes(char)) && !key.endsWith(FIRST)
        ? undefined
        : "not a well-formed position: expected a non-empty base-36 key not ending in " +
          JSON.stringify(FIRST),
    ),
  ),
  Schema.brand("Position"),
);

export type Position = typeof Position.Type;

/**
 * Brands a key without checking it.
 *
 * The brand is a phantom type — `Schema.brand` adds no runtime check — so a key
 * whose validity is guaranteed by the code that built it needs no re-validation,
 * only the type. Reserved for exactly that case: everything arriving from outside
 * goes through the schema instead.
 */
const unsafeMake = Brand.nominal<Position>();

/**
 * Bounds that are not in ascending order.
 *
 * The brand rules out a malformed key, but two well-formed keys can still arrive
 * the wrong way round, and no type catches that. It is a bug in the caller rather
 * than an outcome to handle, so it is raised as a defect: thrown here, and
 * collected as `Die` in the `Cause` by any `Effect` that runs it. The recoverable
 * errors — the ones callers match on and that cross the wire — are ADR 6's set.
 */
export class InvalidBounds extends Data.TaggedError("InvalidBounds")<{
  readonly lower: Position;
  readonly upper: Position;
}> {
  override get message(): string {
    return `Position.between: lower bound ${JSON.stringify(this.lower)} does not sort below upper bound ${JSON.stringify(this.upper)}`;
  }
}

/**
 * Generates a position sorting strictly between `lower` and `upper`.
 *
 * Either bound may be absent: no `lower` means before the first position, no
 * `upper` means after the last, and neither means the first position on an empty
 * shelf. A `lower` that does not sort below `upper` fails as a defect.
 *
 * Keys lengthen as gaps are filled repeatedly; rebalancing is deferred (ADR 5).
 */
export const between = (lower: Position | undefined, upper: Position | undefined): Position => {
  if (lower !== undefined && upper !== undefined && lower >= upper) {
    throw new InvalidBounds({ lower, upper });
  }

  let result = "";
  for (let index = 0; ; index++) {
    const lowerDigit = index < (lower?.length ?? 0) ? valueOf(lower![index]!) : BELOW;
    const upperDigit = index < (upper?.length ?? 0) ? valueOf(upper![index]!) : ABOVE;

    if (upperDigit - lowerDigit > 1) {
      const middle = Math.floor((lowerDigit + upperDigit) / 2);
      if (middle !== 0) {
        return unsafeMake(result + charFor(middle));
      }
      result += FIRST;
      continue;
    }

    result += index < (lower?.length ?? 0) ? lower![index]! : FIRST;
  }
};
