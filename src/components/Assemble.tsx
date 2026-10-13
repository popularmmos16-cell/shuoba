import { useState } from 'preact/hooks';

// Shared by "Build the sentence" (Extra) and the phrase session: tap pieces into place, tap a placed piece to take it back.
export function useAssemble(tiles: string[], answer: string) {
  const [placed, setPlaced] = useState<number[]>([]);
  const [locked, setLocked] = useState(false);
  return {
    placed,
    locked,
    add: (n: number) => !locked && setPlaced((p) => [...p, n]),
    remove: (n: number) => !locked && setPlaced((p) => p.filter((x) => x !== n)),
    complete: placed.length === tiles.length,
    isCorrect: () => placed.map((n) => tiles[n]).join('') === answer,
    lock: () => setLocked(true),
    reset: () => {
      setPlaced([]);
      setLocked(false);
    },
  };
}

export type AssembleState = ReturnType<typeof useAssemble>;

export function AnswerBar({ a, tiles, result }: { a: AssembleState; tiles: string[]; result: boolean | null }) {
  return (
    <div class={`answerbar ${result === true ? 'right' : result === false ? 'wrong' : ''}`}>
      {a.placed.length === 0 && <small>Tap the pieces in order</small>}
      {a.placed.map((n) => (
        <button class="piece" onClick={() => a.remove(n)}>{tiles[n]}</button>
      ))}
    </div>
  );
}

export function Bank({ a, tiles }: { a: AssembleState; tiles: string[] }) {
  return (
    <div class="bank">
      {tiles.map((t, n) => (
        <button class="piece" disabled={a.placed.includes(n)} onClick={() => a.add(n)}>{t}</button>
      ))}
    </div>
  );
}
