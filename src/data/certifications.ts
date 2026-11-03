/**
 * Licenses and certifications.
 *
 * This is the only list the site uses.
 *
 * DeepLearning.AI entries (group: "ai") each get a page at /certificates/<id>.
 * A note or a demo points at one with the frontmatter field `certification`.
 * The id in that field is the `id` in this file. The build fails if the id
 * is missing or is not one of these DeepLearning.AI ids.
 *
 * Older credentials (group: "earlier") are shown on the About page only.
 * Do not use them in `certification` frontmatter.
 *
 * Add a certificate by copying one block. Write the name, issuer, date, and
 * link as they appear on the credential. Do not invent a course. A DeepLearning.AI
 * entry also needs `blurb`: one or two plain sentences, based on the public
 * course page, not a lesson-by-lesson retelling.
 *
 * Fields:
 * - id: a unique key (letters, numbers, dashes). This is the slug in
 *   /certificates/<id> and the value of `certification` in a note or demo.
 * - name, issuer: shown as written.
 * - date: three-letter month and year, such as "Oct 2026".
 *   Newer dates are shown first. The same month keeps the order in this file.
 * - credentialUrl: the public credential page. Leave the line out if there is no link.
 * - group: "ai" (DeepLearning.AI) or "earlier" (data, cloud, and older, About only).
 * - blurb: required for group "ai". A short plain description for the certificate page.
 * - current: true puts a top-level DeepLearning.AI certificate on the home row.
 *   Do not set it on a course nested under a specialization, and do not set it
 *   on an older credential.
 * - parentId: set this to a specialization's id to nest a course underneath it.
 * - expired: a date such as "Oct 2021", only when the credential has lapsed.
 * - skills: optional short labels. Leave them out unless you want them shown.
 * - logo: optional. A file in public/ ("/covers/badge.svg") or an https URL.
 *
 * The entries below were read from LinkedIn on Oct 28, 2026, except
 * A2A: The Agent2Agent Protocol, added November 2, 2026.
 */

export type CertificationGroup = 'ai' | 'earlier';

export type Certification = {
  id: string;
  name: string;
  issuer: string;
  date: string;
  credentialUrl?: string;
  group: CertificationGroup;
  current?: boolean;
  parentId?: string;
  expired?: string;
  /** Plain description for a DeepLearning.AI certificate page. Required when group is "ai". */
  blurb?: string;
  skills?: readonly string[];
  logo?: string;
};

export const certifications: readonly Certification[] = [
  {
    id: 'a2a-agent2agent-protocol',
    name: 'A2A: The Agent2Agent Protocol',
    issuer: 'DeepLearning.AI',
    date: 'Nov 2026',
    credentialUrl: 'https://www.deeplearning.ai/accomplishments/02f269b7-3a41-49ef-b969-a8c30810e648',
    group: 'ai',
    current: true,
    blurb:
      'How agents built with different frameworks discover each other and talk, using the Agent2Agent protocol. Built with Google Cloud and IBM Research. A2A is how agents collaborate; MCP is how an agent reaches tools and data.',
  },
  {
    id: 'dspy',
    name: 'DSPy: Build and Optimize Agentic Apps',
    issuer: 'DeepLearning.AI',
    date: 'Oct 2026',
    credentialUrl: 'https://www.deeplearning.ai/accomplishments/f4aa3b02-1cdd-4066-a94d-10ed3ab703ab',
    group: 'ai',
    current: true,
    blurb:
      'A short course on DSPy: write a language-model program as small modules, then tune it instead of hand-editing prompts.',
  },
  {
    id: 'post-training-llms',
    name: 'Post-training of LLMs',
    issuer: 'DeepLearning.AI',
    date: 'Oct 2026',
    credentialUrl: 'https://www.deeplearning.ai/accomplishments/0ff17c48-ff60-4a8f-a0a3-aa610251b5dc',
    group: 'ai',
    current: true,
    blurb:
      'How a pretrained language model is adapted afterward, with supervised fine-tuning, preference tuning, and reinforcement learning.',
  },
  {
    id: 'data-agents',
    name: 'Building and Evaluating Data Agents',
    issuer: 'DeepLearning.AI',
    date: 'Oct 2026',
    credentialUrl: 'https://www.deeplearning.ai/accomplishments/e21e6fa7-a05d-4319-ab9b-e441494fc81b',
    group: 'ai',
    current: true,
    blurb:
      'How to build an agent that answers from data, and how to check that the answer stays grounded in what it retrieved.',
  },
  {
    id: 'agentic-ai',
    name: 'Agentic AI',
    issuer: 'DeepLearning.AI',
    date: 'Oct 2026',
    credentialUrl: 'https://www.deeplearning.ai/certificates/23ee1276-c1ea-41f3-84cf-424ec09031c5',
    group: 'ai',
    current: true,
    blurb: 'How to build a system that plans, uses tools, and checks its own work across more than one step.',
  },
  {
    id: 'deep-learning-specialization',
    name: 'Deep Learning Specialization',
    issuer: 'DeepLearning.AI',
    date: 'Oct 2026',
    credentialUrl: 'https://www.deeplearning.ai/certificates/6fe275db-f74a-4f06-a856-a54ac5fc3aec',
    group: 'ai',
    current: true,
    blurb:
      'The specialization certificate for neural networks: how they learn, how to tune them, how to structure a project, and how convolutional networks read images.',
  },
  {
    id: 'convolutional-neural-networks',
    name: 'Convolutional Neural Networks',
    issuer: 'DeepLearning.AI',
    date: 'Sep 2026',
    credentialUrl: 'https://www.deeplearning.ai/certificates/bc4f03ff-1c0e-48a7-8074-e707e3f1bd20',
    group: 'ai',
    parentId: 'deep-learning-specialization',
    blurb: 'How a network learns from images. Convolution is the tool it uses to pick up visual patterns.',
  },
  {
    id: 'structuring-ml-projects',
    name: 'Structuring Machine Learning Projects',
    issuer: 'DeepLearning.AI',
    date: 'Sep 2026',
    credentialUrl: 'https://www.deeplearning.ai/certificates/c4a08be6-02b2-476d-91a1-6c93edc7c190',
    group: 'ai',
    parentId: 'deep-learning-specialization',
    blurb: 'How to look at a machine-learning project, see what is holding it back, and choose the next experiment.',
  },
  {
    id: 'improving-deep-neural-networks',
    name: 'Improving Deep Neural Networks: Hyperparameter Tuning, Regularization and Optimization',
    issuer: 'DeepLearning.AI',
    date: 'Sep 2026',
    credentialUrl: 'https://www.deeplearning.ai/certificates/13a17bc2-eeee-44c5-a1ad-3b7c09d42cb8',
    group: 'ai',
    parentId: 'deep-learning-specialization',
    blurb:
      'How to train a network more reliably: initialization, regularization, and the choices that change optimization.',
  },
  {
    id: 'neural-networks-deep-learning',
    name: 'Neural Networks and Deep Learning',
    issuer: 'DeepLearning.AI',
    date: 'Aug 2026',
    credentialUrl: 'https://www.deeplearning.ai/certificates/e55b3575-c00e-4e9e-85c8-b5c09a30f443',
    group: 'ai',
    parentId: 'deep-learning-specialization',
    blurb: 'What a neural network is, and how a forward pass and a backward pass fit together.',
  },
  {
    id: 'gcp-professional-data-engineer',
    name: 'Google Cloud Certified Professional Data Engineer',
    issuer: 'Google',
    date: 'Jan 2019',
    credentialUrl: 'https://www.credential.net/8fxyo9to',
    group: 'earlier',
  },
  {
    id: 'pmp',
    name: 'Project Management Professional (PMP)',
    issuer: 'Project Management Institute',
    date: 'Oct 2018',
    expired: 'Oct 2021',
    group: 'earlier',
  },
  {
    id: 'edx-ph526x',
    name: 'Edx Harvard PH526x Using Python For Research',
    issuer: 'edX',
    date: 'Aug 2017',
    credentialUrl: 'https://courses.edx.org/certificates/fbbdc442aa0f45ae9a6a5207d7c77cd2',
    group: 'earlier',
  },
  {
    id: 'edx-6001x',
    name: '6.00.1x: Introduction to Computer Science and Programming Using Python',
    issuer: 'edX',
    date: 'Mar 2017',
    credentialUrl: 'https://courses.edx.org/certificates/8e1f6ecdf6c04c068247dc5de6accc4c',
    group: 'earlier',
  },
  {
    id: 'capm',
    name: 'Certified Associate in Project Management',
    issuer: 'Project Management Institute',
    date: 'Jan 2017',
    group: 'earlier',
  },
  {
    id: 'edx-ml-for-data-science',
    name: 'edX Honor Code Certificate for Machine Learning for Data Science and Analytics',
    issuer: 'edX',
    date: 'Mar 2016',
    credentialUrl: 'https://courses.edx.org/certificates/d64d368695bc41ffa738c757abc8e165',
    group: 'earlier',
  },
  {
    id: 'oracle-sql-expert',
    name: 'Oracle Database SQL Expert',
    issuer: 'Oracle',
    date: 'Jan 2016',
    group: 'earlier',
  },
  {
    id: 'sas-base',
    name: 'SAS Certified Base Programmer',
    issuer: 'SAS',
    date: 'Apr 2015',
    group: 'earlier',
  },
  {
    id: 'sas-advanced',
    name: 'SAS Certified Advanced Programmer',
    issuer: 'SAS',
    date: 'Apr 2015',
    group: 'earlier',
  },
];
