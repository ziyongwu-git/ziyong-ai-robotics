import { certifications, type Certification, type CertificationGroup } from '../data/certifications';

/**
 * Sorting and checks for src/data/certifications.ts.
 * Pages should import from this file, not from the data file directly,
 * so a broken entry fails the build with a plain-language error.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DATE_PATTERN = /^[A-Z][a-z]{2} \d{4}$/;

function stamp(date: string): number {
  const [monthName, yearText] = date.split(' ');
  const month = MONTHS.indexOf(monthName ?? '');
  const year = Number(yearText);
  if (month < 0 || !Number.isFinite(year)) return -1;
  return year * 12 + month;
}

function assertCertifications(items: readonly Certification[]) {
  const ids = new Set<string>();

  for (const item of items) {
    if (!item.id || !/^[a-z0-9-]+$/.test(item.id)) {
      throw new Error(`Certification "${item.name}" needs an id made of lowercase letters, numbers, and dashes.`);
    }
    if (ids.has(item.id)) {
      throw new Error(`Two certifications use the id "${item.id}". Ids have to be unique.`);
    }
    ids.add(item.id);

    if (!item.name.trim() || !item.issuer.trim()) {
      throw new Error(`Certification "${item.id}" is missing a name or an issuer.`);
    }
    if (!DATE_PATTERN.test(item.date) || stamp(item.date) < 0) {
      throw new Error(`"${item.name}": date must look like "Oct 2026".`);
    }
    if (item.expired && (!DATE_PATTERN.test(item.expired) || stamp(item.expired) < 0)) {
      throw new Error(`"${item.name}": expired must look like "Oct 2021", or be left out.`);
    }
    if (item.credentialUrl && !/^https:\/\//.test(item.credentialUrl)) {
      throw new Error(`"${item.name}": credentialUrl must be an https link, or be left out.`);
    }
    if (item.logo && !item.logo.startsWith('/') && !item.logo.startsWith('https://')) {
      throw new Error(`"${item.name}": logo must start with / or https://.`);
    }
    if (item.current && item.parentId) {
      throw new Error(`"${item.name}" is nested under a specialization, so it should not also be marked current.`);
    }
    if (item.current && item.group !== 'ai') {
      throw new Error(
        `"${item.name}" is marked current, but only a DeepLearning.AI certificate can appear on the home row. Older credentials stay on the About page.`,
      );
    }
    if (item.group === 'ai' && item.issuer !== 'DeepLearning.AI') {
      throw new Error(`"${item.name}" is in the ai group, so the issuer should be DeepLearning.AI.`);
    }
    if (item.group === 'ai' && !item.blurb?.trim()) {
      throw new Error(
        `"${item.name}" needs a blurb: one or two plain sentences for its page at /certificates/${item.id}.`,
      );
    }
  }

  for (const item of items) {
    if (!item.parentId) continue;
    const parent = items.find((candidate) => candidate.id === item.parentId);
    if (!parent) {
      throw new Error(`"${item.name}" lists parentId "${item.parentId}", but no certificate has that id.`);
    }
    if (parent.parentId) {
      throw new Error(`"${item.name}" is nested under "${parent.name}", which is itself nested. Keep nesting to one level.`);
    }
    if (parent.group !== item.group) {
      throw new Error(`"${item.name}" should use the same group as "${parent.name}".`);
    }
  }
}

assertCertifications(certifications);

const sourceOrder = new Map(certifications.map((item, index) => [item.id, index]));

/** Newest month first. A tie keeps the order written in the data file. */
export function byNewest(items: readonly Certification[]): Certification[] {
  return [...items].sort((a, b) => {
    const byDate = stamp(b.date) - stamp(a.date);
    if (byDate !== 0) return byDate;
    return (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0);
  });
}

/** Top-level DeepLearning.AI certificates marked for the home row. */
export function currentlyLearning(): Certification[] {
  return byNewest(certifications.filter((item) => item.current === true && item.group === 'ai'));
}

/** Every DeepLearning.AI certificate, newest first. Nested courses included. */
export function learningCertificates(): Certification[] {
  return byNewest(certifications.filter((item) => item.group === 'ai'));
}

/** Top-level certificates in one group. Nested courses are not included. */
export function certificationsInGroup(group: CertificationGroup): Certification[] {
  return byNewest(certifications.filter((item) => item.group === group && !item.parentId));
}

/** Courses listed under a specialization, newest first. */
export function coursesUnder(parentId: string): Certification[] {
  return byNewest(certifications.filter((item) => item.parentId === parentId));
}

export function certificationById(id: string): Certification | undefined {
  return certifications.find((item) => item.id === id);
}

/** This certificate, plus the courses nested under it. */
export function familyIds(id: string): string[] {
  return [id, ...coursesUnder(id).map((item) => item.id)];
}

/** One frontmatter id, or a list, with duplicates removed. */
export function certificationIds(value: string | readonly string[]): string[] {
  const ids = typeof value === 'string' ? [value] : [...value];
  return [...new Set(ids)];
}

export function usesCertification(value: string | readonly string[], ids: readonly string[]): boolean {
  const wanted = new Set(ids);
  return certificationIds(value).some((id) => wanted.has(id));
}

/** Resolve frontmatter ids to certificate records. Throws if one is missing. */
export function certsFor(value: string | readonly string[]): Certification[] {
  return certificationIds(value).map((id) => {
    const cert = certificationById(id);
    if (!cert) {
      throw new Error(
        `certification "${id}" is not in src/data/certifications.ts. The content check should have caught this before the page rendered.`,
      );
    }
    return cert;
  });
}
