# Ziyong Wu — personal site

A personal notebook: a home page, a learning log, projects, and an about page. The home page leads with notes and projects. The resume-style background lives on About.

It is built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com), and [MDX](https://mdxjs.com), with React available when a project needs something interactive (a slider, a chart, a small tool). The finished site is a folder of static files, which [Vercel](https://vercel.com) can host for free.

If you want the plain-language version of those tool names, read [docs/LEARNING-NOTES.md](docs/LEARNING-NOTES.md). This file is the practical guide.

You do not need to be a web developer to add a note. The usual change is: copy a sample file, edit the words, save.

## Run it locally

You need [Node.js](https://nodejs.org) 22 (22.23 or newer matches the Astro version in this repo).

In a terminal, from this folder:

```bash
npm install
npm run dev
```

Open [http://localhost:4321](http://localhost:4321).

`npm install` downloads the tools listed in `package.json`. You run it again only when those tools change.

`npm run dev` starts a local preview. Saving a file refreshes the browser. Stop the server with Ctrl+C.

To check the production build (the same thing Vercel runs):

```bash
npm run build
npm run preview
```

`npm run build` writes the site into `dist/`. If that command finishes without an error, the site builds.

## What each folder is for

| Path | What it is |
| --- | --- |
| `src/pages/` | URLs. `index.astro` is the home page. `about.astro` is `/about`. A folder plus `index.astro` is a section, such as `/learning`. |
| `src/layouts/BaseLayout.astro` | The shared shell: header, footer, and the tags search engines read. |
| `src/components/` | Pieces reused by pages. React demos live in `src/components/demos/`. |
| `src/content/learning/` | Learning-log posts. One `.md` or `.mdx` file per note. |
| `src/content/projects/` | Project write-ups. Use `.mdx` when the page embeds a demo. |
| `src/content.config.ts` | The checklist for those files (required title, allowed tags, and so on). It sits **next to** `content/`, not inside it. |
| `src/data/certifications.ts` | Licenses and courses. One list, used by the home page, the learning log, and `/learning/certifications`. |
| `src/config.ts` | Your name, one-line positioning, public URL, and contact links. |
| `src/styles/global.css` | Colors, fonts, and dark mode. |
| `src/lib/` | Small helpers (dates, loading posts, sorting certificates, generated covers). |
| `public/` | Files copied as-is. The favicon is here. Pictures for notes go in `public/covers/`. |
| `docs/` | Notes about the tools. These pages are not on the website. |
| `astro.config.ts` | Astro settings: static output, React, MDX, the sitemap. |
| `dist/` | The built site. Generated. Do not edit it. |
| `node_modules/` | Downloaded tools. Generated. Do not edit it. |

The header links are the `nav` list in `src/config.ts`.

## Pages

| URL | Page |
| --- | --- |
| `/` | Home: the notebook, a short "currently learning" strip, latest notes, featured projects |
| `/learning` | Learning log, newest first, with tag filters and a certifications sidebar |
| `/learning/<file-name>` | One note |
| `/learning/certifications` | Full list of licenses and courses |
| `/projects` | Project index |
| `/projects/<file-name>` | One project |
| `/about` | Bio, experience, skills, education, and contact |
| `/rss.xml` | RSS feed for the learning log |
| `/sitemap-index.xml` | Sitemap |

## Add a learning-log post

1. Copy `src/content/learning/sample-attention-notes.md`.
2. Rename the copy. Use lowercase letters, numbers, and dashes. `attention-notes.md` becomes the URL `/learning/attention-notes`. Put the file directly in `src/content/learning/` (no subfolder). Do not name it `index.md`.
3. Replace the frontmatter and the body. Frontmatter is the block between the two `---` lines at the top. It is data about the note, not the note itself.

```yaml
---
title: "What I learned about retrieval"
date: 2026-11-02
tags:
  - ai
  - data
# course/source — the field name is source
source: "Fast.ai Practical Deep Learning, lesson 2"
summary: "Two sentences a reader can scan without opening the note."
# Optional picture. Leave the line out for a generated pattern.
# cover: "/covers/my-picture.jpg"
---
```

Then write the note in Markdown under that block: headings (`##`), lists, links, and fenced code blocks.

Rules the build will enforce:

- `title`, `date`, `tags`, `source`, and `summary` are required.
- `date` is `YYYY-MM-DD`.
- `tags` is one or more of `ai`, `robotics`, `data`. To allow a new tag, add it to the `tags` array in `src/config.ts`.
- `source` is the course, paper, video, or book. The label on the page is "Course / source".
- `cover` is optional. Put an image in `public/covers/` and set `cover: "/covers/my-picture.jpg"`, or use an `https://` URL. Leave the line out and the site draws a pattern from the tags (AI, robotics, data). A file in `public/` does not follow the light/dark switch, so give a photo or a drawing its own background. The sample attention note uses `public/covers/attention.svg` as the example. The pattern covers are original drawings in the code, not stock photos.

Save the file. The dev server should show the note on `/learning` and on the home page (the three newest). If it does not appear, stop the server and run `npm run dev` again.

The two files whose titles start with `[Sample]` are examples. Delete them when you no longer want them on the site.

## Add a project

Same idea, in `src/content/projects/`.

Use a `.md` file when the project is writing plus links. Use `.mdx` when you also embed a widget. The sample project is `.mdx` because it contains the arm demo.

```yaml
---
title: "Sensor log viewer"
summary: "What it does, in one or two sentences."
tags:
  - data
status: in-progress
featured: true
date: 2026-11-02
demo: "https://example.com/my-demo"
repo: "https://github.com/ziyongwu-git/my-repo"
---
```

- `status` is one of `idea`, `in-progress`, `shipped`, or `sample`. Use `sample` only for format examples. The page shows a placeholder banner when the status is `sample`.
- `featured: true` puts the project on the home page. Omit it, or set `false`, to keep the project on the projects page only.
- `date` is optional. Newer dates are listed first.
- `demo` and `repo` are optional. Leave the line out when you do not have a link. A link must start with `/` (a page on this site), `http://`, or `https://`.
- `cover` works the same way as on a learning note.

`/projects/sample-two-link-arm` is the example, including a working demo. Delete that file when you are done with it, and delete `src/components/demos/RobotArm.tsx` and `kinematics.ts` if nothing else imports them.

## Embed an interactive demo

A demo is a React component: a function that returns the widget, and that can remember slider positions.

1. Create `src/components/demos/YourDemo.tsx`. Copy `RobotArm.tsx` if you want a starting shape. The math for the arm is in `kinematics.ts`, next to it, so the drawing file stays readable.
2. In the project file (it must be `.mdx`), import the component and render it.

The path is counted from the project file. `src/content/projects/your-file.mdx` goes up two folders to reach `src/`:

```mdx
import YourDemo from '../../components/demos/YourDemo.tsx';

<YourDemo client:load />
```

`client:load` is the important part. It tells Astro to send the JavaScript for this component when the page loads. Without it, the widget is a still picture and the sliders do not move. The rest of the page stays ordinary HTML.

`client:visible` (load when scrolled into view) and `client:idle` (load after the page is quiet) are the other common choices. Use `client:load` for a demo at the top of the page.

If the widget's buttons look strangely spaced, add `className="not-prose"` to its outer element, the way `RobotArm.tsx` does. Article typography restyles buttons inside the write-up unless you opt out.

In an `.mdx` file, `{` starts code. When you mention a snippet in a sentence, wrap it in backticks.

## Certifications and courses

Edit `src/data/certifications.ts`. Copy an existing block. The comment at the top of that file explains each field.

- `current: true` puts a certificate on the home page strip and the learning-log sidebar. Use it for recent certificates, not for a course that is nested under a specialization.
- `parentId` nests a course under another entry. The Deep Learning Specialization is the example: its four courses set `parentId: 'deep-learning-specialization'`.
- `expired` is a date such as `Oct 2021`, only when the credential has lapsed. PMP is marked that way.
- Leave `credentialUrl` out when there is no public link. Do not invent a course or a description of what it taught.

`/learning/certifications` prints the whole list in two groups. About links to that page.

## Change words, links, and colors

- Name, positioning, public URL, email, LinkedIn, and GitHub: `src/config.ts`. Email is `ziyong.w@gmail.com` (a `mailto` link in the footer and on About). LinkedIn is `https://www.linkedin.com/in/ziyongwu/`. GitHub is `https://github.com/ziyongwu-git`. Do not add a phone number or a street address.
- The resume-style copy (roles, dates, skills, education): `src/profile.ts`. Add a line only when you can point at the source. The public location line stays "Seattle area".
- Licenses and courses: `src/data/certifications.ts`, not `profile.ts`.
- Colors and fonts: the two variable blocks at the top of `src/styles/global.css`. The home-page sketch is `src/components/HeroFigure.astro`. Its motion stops when the browser is set to reduced motion.

The public URL in `src/config.ts` (`url`) is what the sitemap and RSS feed use. It has no trailing slash.

## Deploy to Vercel

The site is static. You do not add a database or a server.

1. Push this repository to GitHub.
2. Sign in at [vercel.com](https://vercel.com) with your GitHub account.
3. Choose **Add New… → Project** and import `ziyongwu-git/ziyong-ai-robotics`.
4. Vercel usually detects Astro. Confirm these settings if it asks:
   - Framework preset: **Astro**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
   - Node.js version: **22.x**
5. Click **Deploy**. Vercel gives you a URL such as `https://ziyong-ai-robotics.vercel.app`.
6. Copy that URL into `url` in `src/config.ts` (no trailing slash) and push again. The sitemap and the RSS feed then point at the real domain.

Later deploys happen when you push to the branch Vercel is watching, usually `main`.

## If the build fails

Read the last lines of the terminal. The content checker is the usual cause:

- A tag other than `ai`, `robotics`, or `data`.
- A missing `title`, `date`, `source`, or `summary` on a note.
- A date not written as `YYYY-MM-DD`.
- A project `status` outside `idea`, `in-progress`, `shipped`, `sample`.
- A `demo`, `repo`, or `cover` path that does not start with `/`, `http://`, or `https://`.
- A certification date that is not like `Oct 2026`, a repeated `id`, or a `parentId` that does not match another entry. The error names the certificate.

Fix the file it names and run `npm run build` again.

## Sample content

These three files are format examples, marked **Sample** on the site. They are not a portfolio of finished work.

- `src/content/learning/sample-attention-notes.md`
- `src/content/learning/sample-planar-robot-arms.md`
- `src/content/projects/sample-two-link-arm.mdx`
