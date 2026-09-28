export type TransitionType =
  | "cut"
  | "dissolve"
  | "fade_in"
  | "fade_out"
  | "wipeleft"
  | "slideright"
  | "circleopen";

export function transitionOverlap(
  left: number,
  right: number,
  transition: TransitionType,
) {
  return transition === "cut" ? 0 : Math.min(0.5, left / 2, right / 2);
}

export function buildTimeline(
  durations: number[],
  transitions: TransitionType[],
) {
  let start = 0;
  return durations.map((duration, index) => {
    const clip = { start, duration };
    start +=
      duration -
      (index < durations.length - 1
        ? transitionOverlap(
            duration,
            durations[index + 1],
            transitions[index] ?? "cut",
          )
        : 0);
    return clip;
  });
}
