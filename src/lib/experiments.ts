/**
 * The first thing a visitor should try on a demo.
 * The widget has to actually do this. The sentence only points at it.
 */
export function experimentHint(id: string): string {
  switch (id) {
    case 'see-think-move':
      return 'Move the red block, then run “Put the red block in the tray.” The tokens and the path should follow the new spot.';
    case 'follow-the-packet':
      return 'Change the clinic card to “A helpful assistant.” and ask for a pediatrician in Seattle. The routing score should drop, and the handoff should stop.';
    case 'ask-the-notebook':
      return 'Run one scorer, then add a second scorer in parallel and compare the passages for the same question.';
    case 'sample-two-link-arm':
      return 'A format sample. The sliders solve a two-link arm. It is not one of the shipped demos.';
    default:
      return 'Open the demo and use the first experiment on the page.';
  }
}
