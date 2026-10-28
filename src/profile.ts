/**
 * Background shown on the about page.
 * Every line here is taken from Ziyong's resume. Do not add employers,
 * dates, degrees, or metrics that are not already written down.
 * Do not add a phone number or a street address.
 * The public location line stays "Seattle area".
 *
 * Certifications and courses are not in this file.
 * They live in src/data/certifications.ts.
 */

export const locationLabel = 'Seattle area';

export const highlights = [
  {
    title: 'Smart glasses and XR',
    text: 'Built the logging, dashboards, and real-time alerting for the Ray-Ban Stories launch, and the measurement stack for an XR-input product, from near zero, to support a rollout to 100% of users.',
  },
  {
    title: 'Model evaluation',
    text: 'Designed an accuracy metric for a company AI system that became the org’s official 2024 goaling metric. Earlier machine-learning work at Munich Re used gradient boosting, clustering, and PCA.',
  },
  {
    title: 'Large-scale data platforms',
    text: 'Set strategy for an advertising data platform (Guidance DB), certified core data sources, and planned capacity for a 100+ engineer organization: about 160,000 compute units and 9 petabytes.',
  },
] as const;

export const experience = [
  {
    org: 'Meta',
    title: 'Staff Data Engineer, Ads Guidance & Monetization',
    dates: '2023 – Jul 2026',
    place: 'Seattle area',
    points: [
      'Led the data-engineering effort for Ads Manager 1P Viewability, a measurement-accreditation program. Meta received its first positive re-accreditation since 2021.',
      'Set multi-year technical strategy for Guidance DB, including a data-quality problem with 4× duplicate tables, and set certification standards for core sources.',
      'Designed an accuracy metric for a company AI system where ground truth was missing. The org adopted it as the official 2024 goaling metric.',
      'Led capacity planning for a 100+ engineer organization: about 160,000 compute units and 9 petabytes of new capacity, bringing utilization from 90% to 60%. A separate reclamation platform unlocked about $4M in annual infrastructure savings.',
    ],
  },
  {
    org: 'Meta',
    title: 'Senior Data Engineer, AR/VR, People Analytics & Ads/Monetization',
    dates: '2019 – 2023',
    place: 'Seattle area',
    points: [
      'Founding data engineer for a new AR/VR product area. Built core product metrics and data infrastructure, and a user-engagement measurement method later adopted company-wide.',
      'Built the data and analytics foundation for the Ray-Ban Stories smart-glasses launch: logging, dashboards, and real-time operational alerting. The main dashboard reached about 150 monthly active users and caught 3 major incidents in the first 3 weeks.',
      'First data engineer for a new XR-input product. The measurement stack supported a rollout to 100% of users, and a pre-launch check caught a severe (+40%) regression.',
      'Led a multi-year telemetry-quality remediation that removed the majority of false-positive accuracy issues. Also owned company-wide employee-mobility pipelines used by 50+ downstream consumers.',
    ],
  },
  {
    org: 'Munich Re (Group)',
    title: 'Senior Data Engineer / Technical Lead',
    dates: 'May 2018 – Mar 2019',
    place: 'Princeton, NJ',
    points: [
      'Technical lead for a divisional underwriting-dashboard modernization on Apache Hive, Apache Spark, and Microsoft Azure. Applied gradient boosting, clustering, and PCA in Python and PySpark.',
    ],
  },
  {
    org: 'Munich Re (Group)',
    title: 'Data Engineer',
    dates: 'Jun 2017 – Apr 2018',
    place: 'Princeton, NJ',
    points: [
      'Built a real-time financial reporting dashboard in SAS Visual Analytics on automated pipelines. Supported data-science work with text mining, clustering, and generalized linear models.',
    ],
  },
  {
    org: 'Munich Re (Group)',
    title: 'Research Analyst',
    dates: 'Mar 2016 – Jun 2017',
    place: 'Princeton, NJ',
    points: [
      'Developed an insurance-pricing statistical sub-model for Equipment Breakdown and Homeowner lines in SAS and R, plus a reusable SAS macro for exploratory analysis.',
    ],
  },
  {
    org: 'SCIO Health Analytics',
    title: 'Junior Data Analyst / SAS Developer',
    dates: '2015 – 2016',
    place: '',
    points: [
      'Designed and automated ETL for intake, warehousing, and quality checks, and built production SAS macros in a table-driven architecture.',
    ],
  },
] as const;

export const earlyCareer =
  'Predictive Modeling Intern, XL Group (2014). Data Analytics Intern, Employment and Social Development Canada (2014). Teaching Assistant, University of Waterloo (2013–2014). Research Assistant, McMaster University (2013).';

export const skillGroups = [
  {
    label: 'Data engineering & architecture',
    items:
      'Distributed data systems, big-data processing, ETL/ELT, data modeling, warehousing, workflow orchestration, data platform architecture',
  },
  {
    label: 'Languages & tools',
    items: 'SQL, Python, PySpark, Apache Spark, Apache Hive, Hack, JavaScript, SAS, R, Stata',
  },
  {
    label: 'Cloud & platforms',
    items:
      'Google Cloud (Professional Data Engineer), Microsoft Azure, Hive/Presto, Airflow-style orchestration (Meta Dataswarm), internal BI and dashboarding',
  },
  {
    label: 'Governance, analytics & ML',
    items:
      'Data quality and certification, data lineage, metrics and KPIs, A/B testing, machine learning (GBM, clustering, PCA, GLM)',
  },
  {
    label: 'Technical leadership',
    items:
      'Technical strategy and roadmapping, capacity planning and cost optimization, cross-functional stakeholders, mentorship, executive communication',
  },
] as const;

export const education = [
  {
    credential: 'M.A., Economics',
    school: 'University of Waterloo',
    dates: '2013 – 2014',
  },
  {
    credential: 'B.A. (Honours), Economics, summa cum laude',
    school: 'McMaster University',
    dates: '2012 – 2013',
  },
  {
    credential: "B.A., Psychology, Dean's Honor List",
    school: 'McMaster University',
    dates: '2009 – 2012',
  },
] as const;
