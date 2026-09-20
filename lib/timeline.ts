export interface Cue { start: number; end: number; text: string }

// Prefix maximum end times preserve overlapping cues without scanning the
// entire track on each frame. Each language owns an independent index.
export function createTimeline(input: readonly Cue[]) {
  const cues = input.filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end)
    && cue.start >= 0 && cue.end > cue.start && typeof cue.text === 'string')
    .map(cue => ({ ...cue })).sort((a, b) => a.start - b.start);
  const maxEnd: number[] = [];
  cues.forEach((cue, index) => { maxEnd.push(Math.max(cue.end, maxEnd[index - 1] ?? 0)); });
  return (time: number): string[] => {
    if (!Number.isFinite(time) || time < 0) return [];
    let low = 0;
    let high = cues.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (cues[middle]!.start <= time) low = middle + 1;
      else high = middle;
    }
    const active: string[] = [];
    for (let i = low - 1; i >= 0 && maxEnd[i]! > time; i--) {
      if (cues[i]!.end > time) active.push(cues[i]!.text);
    }
    return active.reverse();
  };
}
