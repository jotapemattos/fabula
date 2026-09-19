import { assert, describe, it } from "@effect/vitest";
import { Cause, Effect, Exit, Schema } from "effect";
import { FastCheck } from "effect/testing";
import { between, InvalidBounds, Position } from "../src/Position.ts";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

const isPosition = Schema.is(Position);

/**
 * Well-formed positions, generated rather than taken from `between`, so the
 * properties below are not checked against keys the implementation chose itself.
 */
const position: FastCheck.Arbitrary<Position> = FastCheck.array(
  FastCheck.constantFrom(...ALPHABET),
  { minLength: 1, maxLength: 8 },
)
  .map((chars) => chars.join("").replace(/0+$/, ""))
  .filter((key) => key.length > 0)
  .map((key) => Schema.decodeSync(Position)(key));

/** Two distinct positions, lower first. */
const orderedPair: FastCheck.Arbitrary<readonly [Position, Position]> = FastCheck.tuple(
  position,
  position,
)
  .filter(([left, right]) => left !== right)
  .map(([left, right]): readonly [Position, Position] =>
    left < right ? [left, right] : [right, left],
  );

/** Asserts the shape every generated key must have, never its literal content. */
const assertWellFormed = (key: Position): void => {
  assert.isTrue(isPosition(key), `${JSON.stringify(key)} is not a well-formed position`);
};

describe("Position.between", () => {
  it("generates a position for an empty shelf", () => {
    assertWellFormed(between(undefined, undefined));
  });

  it.prop("sorts strictly between two bounds", [orderedPair], ([[lower, upper]]) => {
    const key = between(lower, upper);
    assertWellFormed(key);
    assert.isTrue(lower < key, `${lower} < ${key}`);
    assert.isTrue(key < upper, `${key} < ${upper}`);
  });

  it.prop("sorts after a bound that is open above", [position], ([lower]) => {
    const key = between(lower, undefined);
    assertWellFormed(key);
    assert.isTrue(lower < key, `${lower} < ${key}`);
  });

  it.prop("sorts before a bound that is open below", [position], ([upper]) => {
    const key = between(undefined, upper);
    assertWellFormed(key);
    assert.isTrue(key < upper, `${key} < ${upper}`);
  });

  it.prop(
    "keeps strict order when the same gap is filled repeatedly",
    [orderedPair, FastCheck.array(FastCheck.boolean(), { minLength: 1, maxLength: 60 })],
    ([[start, end], halves]) => {
      let lower = start;
      let upper = end;
      for (const takeLowerHalf of halves) {
        const key = between(lower, upper);
        assertWellFormed(key);
        assert.isTrue(lower < key && key < upper, `${lower} < ${key} < ${upper}`);
        if (takeLowerHalf) upper = key;
        else lower = key;
      }
    },
  );

  it.prop(
    "keeps strict order when positions are prepended",
    [FastCheck.integer({ min: 1, max: 60 })],
    ([count]) => {
      const shelf = [between(undefined, undefined)];
      for (let i = 0; i < count; i++) {
        const key = between(undefined, shelf[0]);
        assertWellFormed(key);
        shelf.unshift(key);
      }
      assert.deepStrictEqual(shelf, shelf.toSorted());
    },
  );

  it.prop(
    "keeps strict order when positions are appended",
    [FastCheck.integer({ min: 1, max: 60 })],
    ([count]) => {
      const shelf = [between(undefined, undefined)];
      for (let i = 0; i < count; i++) {
        const key = between(shelf[shelf.length - 1], undefined);
        assertWellFormed(key);
        shelf.push(key);
      }
      assert.deepStrictEqual(shelf, shelf.toSorted());
    },
  );

  it.prop(
    "keeps a shelf ordered and free of duplicates however it is built",
    [FastCheck.array(FastCheck.nat(), { minLength: 1, maxLength: 40 })],
    ([insertions]) => {
      const shelf = [between(undefined, undefined)];
      for (const seed of insertions) {
        const at = seed % (shelf.length + 1);
        const key = between(
          at === 0 ? undefined : shelf[at - 1],
          at === shelf.length ? undefined : shelf[at],
        );
        assertWellFormed(key);
        shelf.splice(at, 0, key);
      }
      assert.deepStrictEqual(shelf, shelf.toSorted());
      assert.strictEqual(new Set(shelf).size, shelf.length);
    },
  );

  it.prop("rejects bounds that are not in ascending order", [orderedPair], ([[lower, upper]]) => {
    assert.throws(() => between(upper, lower), InvalidBounds);
  });

  it.prop("rejects a bound paired with itself", [position], ([key]) => {
    assert.throws(() => between(key, key), InvalidBounds);
  });

  it("fails as a defect rather than a typed error", () => {
    const lower = Schema.decodeSync(Position)("5");
    const upper = Schema.decodeSync(Position)("3");
    const exit = Effect.runSyncExit(Effect.sync(() => between(lower, upper)));
    assert.isTrue(Exit.isFailure(exit));
    if (Exit.isFailure(exit)) {
      assert.isTrue(Cause.hasDies(exit.cause), "the cause carries a defect");
      assert.isFalse(Cause.hasFails(exit.cause), "the cause carries no typed failure");
    }
  });
});

describe("Position", () => {
  it.prop("accepts every generated position", [position], ([key]) => {
    assert.isTrue(isPosition(key));
  });

  it("rejects keys that are not well formed", () => {
    for (const bad of ["", "0", "30", "A", "3 ", "3-", "ä"]) {
      assert.isFalse(isPosition(bad), `${JSON.stringify(bad)} should be rejected`);
    }
  });
});
