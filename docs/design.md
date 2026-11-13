# Design notes

**Subject:** a Persian/Dari AI builder for people who are new to building sites, mostly on phones. Its job: turn a sentence into a live site and, when needed, a real database.

**Identity: warm dark, cream and camel.** Charcoal-brown surfaces (hue 70), cream text, and one camel (شتری) accent. Requested by the owner: dark, cream, warm. Low credit turns the meter red. All tokens live in `src/styles.css`.
Contrast (checked): text 15.7:1, muted text >= 6.4:1, camel on charcoal 8.9:1, dark text on camel 8.9:1.

**Motif:** the eight-pointed star made of two squares, the base unit of Persian and Afghan tile work. It is the logo mark (`StarMark` in `components/Logo.tsx`), the favicon, and the `bg-girih` background pattern (hairlines, 7.5% white). The pattern opens outward once on the landing page (`animate-unfold`); nothing else moves on its own.

**Type:** Vazirmatn for everything you read; Lalezar (`font-display`, always with `font-normal`) only for the landing headline, the wordmark and a few empty-state titles. That is the one bold choice.

**Copy rules**
- Say what the person gets, in plain words: "دیتابیس واقعی", not "backend".
- A button names what it does; the toast repeats the same word.
- Empty states tell the next action. Errors say what happened and what to do.
- Progress is honest: elapsed seconds, never an invented list of steps.

**Not done on purpose:** no all-caps labels, no numbered cards, no per-section entrance animations, no gradient washes except the logo tile and the primary button.
