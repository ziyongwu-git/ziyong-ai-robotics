# How the pieces fit

A short explanation of the tools this site uses. The practical steps (run it, add a note, deploy) live in the [README](../README.md).

## Astro

Astro is the site builder. A file in `src/pages` becomes a URL. `src/pages/about.astro` is published at `/about`. `src/pages/index.astro` is the home page.

An `.astro` file has two parts. The top, between the `---` lines, runs when the site is built. That is where you load posts and decide what the page should say. The bottom is the HTML a visitor sees.

Most of the HTML is built ahead of time. `npm run build` writes the finished files into `dist/`. Vercel hosts that folder. There is no database and no server process to keep awake.

## Tailwind CSS

Tailwind is how the pages are styled. Instead of a separate stylesheet for every idea, you put small class names on an element: `mt-6` adds space above it, `text-lg` makes the type larger, `rounded-2xl` rounds the corners.

The colors and fonts are the variables at the top of `src/styles/global.css`. Classes like `bg-paper`, `text-ink`, and `border-line` read those variables. Recolor the site by editing the variables, then look at the page again.

Dark mode is the class `dark` on the `<html>` element. The button in the header adds or removes that class and remembers the choice in the browser. The colors in `global.css` have a light set and a dark set.

## MDX

Markdown is the writing format: headings, lists, links, and the `---` block of data at the top (frontmatter).

MDX is Markdown that can also include a component, the way a page can. A learning note that is only writing can stay a `.md` file. A project that needs a slider or a chart should be a `.mdx` file, with the component placed where you want it to appear.

One caution: in an `.mdx` file, `{` starts a bit of code. If you want a literal `{` in a sentence, put that word in backticks.

## Islands

An island is Astro's name for one interactive piece on a page that is otherwise ordinary HTML.

The two-link arm on the sample project is an island. The paragraphs around it are static HTML. The arm itself is a React component in `src/components/demos/RobotArm.tsx`. React is a library for widgets that update when someone moves a slider or clicks a button.

The MDX file renders it like this:

```mdx
import RobotArm from '../../components/demos/RobotArm.tsx';

<RobotArm client:load />
```

`client:load` means "send the JavaScript for this component when the page loads." Without that directive, Astro draws the arm once during the build and the sliders do not move. The home page does not load that component at all. The picture there is a plain SVG, so visitors who never open the demo do not download it.

Two other directives you may want later:

- `client:visible` loads the widget when the visitor scrolls it into view.
- `client:idle` loads it after the page has finished its first work.

`client:load` is the right default for a demo someone should use immediately.

## Content collections

A content collection is a folder of posts plus a checklist.

`src/content/learning/` holds the notes. `src/content/projects/` holds the projects. `src/content.config.ts` (next to the folder, not inside it) lists the fields each file must have. When you build, Astro checks every file. A missing title or a tag that is not in the allowed list stops the build, which is kinder than a blank page later.

You do not register a new file in the config. The config already says "read every `.md` and `.mdx` file in this folder."

## Pictures

Notes and projects can show a picture. If the file's frontmatter has no `cover`, the site draws one from the tags: a small network for AI, an arm for robotics, streams and bars for data. That drawing is SVG in the page, so it follows light and dark mode, and it does not download an image.

If you set `cover`, the site uses that file instead. Put it in `public/covers/` and point at it with `/covers/your-file.jpg`. A file used that way keeps its own colors in both themes. The sample attention note is the example (`public/covers/attention.svg`). It is an original drawing, not a photo of a person.

The moving sketch on the home page is also SVG and CSS. It is not the React arm. The React arm is only on the sample project, and only because that page says `client:load`.

## Certifications

`src/data/certifications.ts` is a list, not a page. The home page shows the entries marked current. `/learning/certifications` shows every entry. You do not copy the list into the about page. About links to it.

## What you can ignore for now

Server-rendered pages, databases, and hosting adapters. Static files are enough for this site. Add those only when a page needs to do something at the moment someone requests it, such as accept a form and store the answer.
