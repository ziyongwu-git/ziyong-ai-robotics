/**
 * Site-wide facts and the lists the rest of the site is allowed to use.
 * Edit this file when your wording, public URL, or contact links change.
 * Search the project for PLACEHOLDER to find values that are still fake.
 */

/** Tags a learning note or project is allowed to use. Add a new one here. */
export const tags = ['ai', 'robotics', 'data'] as const;
export type Tag = (typeof tags)[number];

/**
 * Project status. `sample` marks an example page. The other three are for
 * your own work: still an idea, being built, or ready to show.
 */
export const projectStatuses = ['idea', 'in-progress', 'shipped', 'sample'] as const;
export type ProjectStatus = (typeof projectStatuses)[number];

/** Header links. The path has to match a file in src/pages. */
export const nav = [
  { href: '/', label: 'Home' },
  { href: '/learning', label: 'Learning log' },
  { href: '/projects', label: 'Projects' },
  { href: '/about', label: 'About' },
] as const;

export const site = {
  name: 'Ziyong Wu',
  /** One line under the name, also used in the browser tab on the home page. */
  role: 'Data engineer moving into AI and robotics',
  /** Default sentence for search results and link previews. */
  description:
    'Ziyong Wu is a data engineer moving into AI and robotics. Learning notes, small projects, and a short bio.',
  /**
   * Public URL of the deployed site, with no trailing slash.
   * After Vercel gives you a domain, replace this and deploy again.
   */
  url: 'https://ziyongwu.vercel.app',
  email: 'you@example.com',
  emailNote: 'PLACEHOLDER — replace with your email',
  linkedin: 'https://www.linkedin.com/in/your-handle',
  linkedinNote: 'PLACEHOLDER — replace with your LinkedIn URL',
  github: 'https://github.com/ziyongwu-git',
} as const;
