import { z } from 'astro/zod';
import { certifications } from '../data/certifications';

/**
 * The `certification` frontmatter field on a note or a demo.
 *
 * It is required. One id, or a list of ids. Each id has to match a
 * DeepLearning.AI entry in src/data/certifications.ts. Older credentials
 * (Google Cloud, PMP, and the rest) are not allowed here. They stay on About.
 *
 * A missing or unknown id fails the build with a message that names the file
 * kind and the ids that would have worked.
 */

const learningCerts = certifications.filter((item) => item.group === 'ai');
const allowedIds = learningCerts.map((item) => item.id);
const allowedList = allowedIds.join(', ');

function problem(kind: string, id: string): string | null {
  const known = certifications.find((item) => item.id === id);
  if (!known) {
    return `${kind}: certification "${id}" is not in src/data/certifications.ts. Use a DeepLearning.AI id. Allowed ids: ${allowedList}.`;
  }
  if (known.group !== 'ai') {
    return `${kind}: "${id}" is ${known.name} from ${known.issuer}. Notes and demos use a DeepLearning.AI certificate. That older credential stays on the About page. Allowed ids: ${allowedList}.`;
  }
  return null;
}

/** `kind` is "Note" or "Demo". It is only used in the error text. */
export function certificationField(kind: 'Note' | 'Demo') {
  return z
    .union([z.string(), z.array(z.string())], {
      error: (issue) => {
        if (issue.input === undefined) {
          return `${kind} is missing certification. Add certification: <id> to the frontmatter (one id, or a list). It has to be a DeepLearning.AI id from src/data/certifications.ts. Example: certification: a2a-agent2agent-protocol. Allowed ids: ${allowedList}.`;
        }
        return `${kind}: certification must be one id or a list of ids. Example: certification: a2a-agent2agent-protocol. Allowed ids: ${allowedList}.`;
      },
    })
    .superRefine((value, ctx) => {
      const ids = typeof value === 'string' ? [value] : value;
      if (ids.length === 0) {
        ctx.addIssue(
          `${kind}: certification is an empty list. Add at least one DeepLearning.AI id. Allowed ids: ${allowedList}.`,
        );
        return;
      }
      const seen = new Set<string>();
      for (const id of ids) {
        if (!id.trim()) {
          ctx.addIssue(`${kind}: certification contains a blank id. Allowed ids: ${allowedList}.`);
          continue;
        }
        if (seen.has(id)) {
          ctx.addIssue(`${kind}: certification lists "${id}" more than once. Keep each id once.`);
          continue;
        }
        seen.add(id);
        const message = problem(kind, id);
        if (message) ctx.addIssue(message);
      }
    });
}
