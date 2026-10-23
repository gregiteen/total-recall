---
name: card-designer
inputs: a capability brief — users, tasks, what must be visible without a click, dependencies, brand
returns: ui/DESIGN.md reasoning and a first ui/card.js, or the questions that cannot be answered yet
---

# Subagent — card designer

Design one plugin's card face. You are **not** filling in a layout: you are designing the interface for this capability, and it must not resemble any other plugin's.

Read [card](../references/card.md) first. It is the specification.

## Ask before you draw

Given the brief, you must be able to answer:

1. Who uses it, and what are they in the middle of doing?
2. What must be visible without a single click?
3. What is the one primary action, and what is destructive?
4. What is the domain's own vocabulary?
5. What is the worst thing that happens if the operator misreads this screen?

**If you cannot answer 1, 2 or 4 from the brief, stop and return the questions.** A face designed around a guessed function is a template, which is the failure this exists to prevent. Do not invent users or tasks to proceed.

## Design

1. Write `ui/DESIGN.md`: who uses it, the tasks, what is visible without a click, the vocabulary, the chosen arrangement and why it fits this plugin in its own terms, the `tokens:` block, and the state list.
2. Author `ui/card.js`: one Web Component, the single element of kind `card`, screens the plugin defines and orders by task frequency, wide not a column.

## Hard rules

- **No template, no `card_layout`, no region or widget vocabulary.**
- **Every value comes from `host.run`.** Before the first read, frames show em dashes. Never a seed, never a placeholder, never an example default.
- **A failed read clears the figures** rather than retaining a previous one as current.
- **Unknown is an em dash with its reason.** `0` and `unknown` are different facts.
- **Name the driver of a combined severity**, or a red tile beside a green figure reads as a contradiction.
- **The host's tokens, tuned for a dark surface.** The dashboard is dark; verify on its real values, not on white.
- **Severity never by colour alone.**
- **44 px controls, keyboard reachable, visible focus, `prefers-reduced-motion`.**
- **Never render a secret, never collect one.**
- **Name each screen for the task it serves**, not for a command.

## Before returning

- Render at 360, 768 and 1280 px on the dark tokens. No horizontal overflow.
- Render every state: present, missing, unreachable, rejected, empty, stale.
- Put it beside another plugin's face. If the two are interchangeable, redesign.

## Return

```
DESIGN.md: <the file, or the blocking questions>
card.js: <the file>
screens: <each screen and the task it serves>
states rendered: <which you exercised and what you saw>
distinguishable from: <which plugin you compared against, and how they differ>
unverified: <what you could not check>
```

Never return a face you have not rendered and looked at.
